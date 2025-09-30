import { type HardhatRuntimeEnvironment } from "hardhat/types";
import type { BaseContract, Log, TransactionReceipt, FunctionFragment, AddressLike } from "ethers";
import { getBigInt } from "ethers";
import { normalizeAddressAsync, revertMap } from "./utils.js";

type HREProvider = HardhatRuntimeEnvironment["ethers"]["provider"];

type Renderable =
  string |
  number |
  boolean |
  null |
  undefined |
  bigint |
  Renderable[] |
  { [key: string]: Renderable };

export interface ScenarioConfig {
  customState?: Record<string, (txReceipt: TransactionReceipt) => Promise<Renderable>>;
  name?: string;
  accounts: Record<string, AddressLike>;
  contracts: Record<string, BaseContract>;
  tokens: Record<string, BaseContract>;
}

interface ScenarioEventRecord {
  contract: string;
  name: string;
  args: unknown[];
}

export interface ScenarioLogRecord {
  type: "methodCall" | "initialState";
  methodFragment: FunctionFragment;
  caller: string;
  contract: string;
  args: unknown[];
  balances: Record<string, Record<string, bigint>>;
  events: ScenarioEventRecord[];
  customState?: Record<string, Renderable>;
}

export type ScenarioLogs = ScenarioLogRecord[] & { [ScenarioLogsSymbol]?: true };

export const ScenarioLogsSymbol = Symbol("ScenarioLogs");
export class Scenario {
  public test: Mocha.Test;
  public name: string;
  public config: ScenarioConfig;
  public logs: ScenarioLogs = [] as ScenarioLogs;

  private addressToContract: Record<string, string> = {};
  private addressToToken: Record<string, string> = {};
  private addressToAccount: Record<string, string> = {};
  private originalSend: HREProvider["send"];
  private decimalsCache: Record<string, number> = {};
  private initializedPromise: Promise<void> | undefined;

  constructor(
    private hre: HardhatRuntimeEnvironment,
    public options: {
      test: Mocha.Test;
      config: ScenarioConfig;
      name?: string;
    },
  ) {
    this.originalSend = this.hre.ethers.provider.send.bind(this.hre.ethers.provider);
    this.config = options.config;
    this.test = options.test;
    this.config = options.config;
    this.logs[ScenarioLogsSymbol] = true;
    this.name = options.name || this.generateNameFromTest(this.test);
    this.waitForInitialization();
  }

  private async init() {
    if (this.initializedPromise) {
      return this.initializedPromise;
    }
    this.addressToContract = await revertMap(this.config.contracts, normalizeAddressAsync);
    this.addressToToken = await revertMap(this.config.tokens, normalizeAddressAsync);
    this.addressToAccount = await revertMap(this.config.accounts, normalizeAddressAsync);
  }

  public async waitForInitialization() {
    if (this.initializedPromise) {
      return this.initializedPromise;
    }
    this.initializedPromise = this.init();
    return this.initializedPromise;
  }

  private generateNameFromTest(currentTest: Mocha.Test) {
    let test: Mocha.Test | Mocha.Suite = currentTest;
    const titlesStack = [];
    while (test) {
      titlesStack.push(test.title);
      test = test.parent as Mocha.Test | Mocha.Suite;
    }
    return titlesStack.filter(title => !!title).reverse().join(" > ");
  }

  injectIntoProvider(provider: HREProvider) {
    this.originalSend = provider.send.bind(provider);
    provider.send = async (...args) => {
      if (args[0] === "eth_sendTransaction" && args[1] !== undefined && args[1][0] !== undefined) {
        const transaction = args[1][0] as unknown as { from: string; to: string; data: string };
        const txHash = await this.originalSend.call(provider, ...args);
        await this.processTx(transaction, txHash);
        return txHash;
      }
      return this.originalSend.call(provider, ...args);
    };
  }

  restoreProvider(provider: HREProvider) {
    provider.send = this.originalSend;
  }

  private getAllContracts(): Record<string, BaseContract> {
    return { ...this.config.contracts, ...this.config.tokens };
  }

  private async getAllBalanceHolders(): Promise<Record<string, string>> {
    const balanceHolders: Record<string, string> = {};
    for (const [name, contract] of Object.entries(this.getAllContracts())) {
      balanceHolders[name] = contract.target.toString().toLowerCase();
    }
    for (const [name, account] of Object.entries(this.config.accounts)) {
      balanceHolders[name] = await normalizeAddressAsync(account);
    }
    return balanceHolders;
  }

  tryParseContractEvent(log: Log): ScenarioEventRecord | undefined {
    for (const [name, contractContract] of Object.entries(this.getAllContracts())) {
      const contractEvent = contractContract.interface.parseLog(log);
      if (contractEvent) {
        return {
          name: contractEvent.name,
          args: this.resolveAddressDeep(contractEvent.args),
          contract: name,
        };
      }
    }
  }

  private async decimals(tokenContract: BaseContract) {
    if (this.decimalsCache[tokenContract.target as string]) {
      return this.decimalsCache[tokenContract.target as string];
    }
    const decimals = (await this.hre.ethers.provider.call({
      to: tokenContract.target,
      data: tokenContract.interface.encodeFunctionData("decimals"),
    })) as unknown as number;
    this.decimalsCache[tokenContract.target as string] = decimals;
    return Number(getBigInt(decimals));
  }

  getTxLogs(txReceipt: TransactionReceipt): ScenarioEventRecord[] {
    return (txReceipt?.logs || [])
      .map(log => this.tryParseContractEvent(log))
      .filter(event => !!event);
  }

  async getBalances(txReceipt: TransactionReceipt) {
    const blockHash = txReceipt.blockHash;
    const balances: Record<string, Record<string, bigint>> = {};
    for (const [name, tokenContract] of Object.entries(this.config.tokens)) {
      const tokenBalances: Record<string, bigint> = {};

      const getBalanceForToken = async (accountAddress: string) => {
        return getBigInt(await this.hre.ethers.provider.call({
          to: tokenContract.target,
          data: tokenContract.interface.encodeFunctionData("balanceOf", [accountAddress]),
          blockTag: blockHash,
        }));
      };

      for (const [accountName, accountAddress] of Object.entries(await this.getAllBalanceHolders())) {
        const balance = await getBalanceForToken(accountAddress);
        tokenBalances[accountName] = balance;
      }
      balances[name] = tokenBalances;
    }

    return balances;
  }

  async getCustomState(txReceipt: TransactionReceipt) {
    const { customState } = this.config;
    if (!customState) {
      return;
    }
    const keys = Object.keys(customState);
    const values = await Promise.all(keys.map(key => customState[key](txReceipt)));
    return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  }

  async processTx(data: { from: string; to: string; data: string }, txHash: string) {
    const caller = this.resolveAddress(data.from);
    const contract = this.resolveAddress(data.to);
    const contractInstance: BaseContract | undefined = this.config.contracts[contract];
    const parsedData = contractInstance?.interface.parseTransaction({ data: data.data });
    const methodFragment = parsedData?.fragment as FunctionFragment;
    if (!methodFragment) {
      throw new Error("Failed to parse method fragment");
    }
    const args = parsedData?.args;
    const txReceipt = await this.hre.ethers.provider.getTransactionReceipt(txHash);
    if (txReceipt === null) {
      // TODO maybe log it with fail status??
      console.warn("Transaction receipt is null", txHash);
      return;
      // throw new Error("Transaction receipt is null");
    }
    const [balances, customState] = await Promise.all([
      this.getBalances(txReceipt),
      this.getCustomState(txReceipt),
    ]);
    const log: ScenarioLogRecord = {
      type: "methodCall",
      methodFragment: methodFragment,
      args: args ? this.resolveAddressDeep(args) : [],
      caller: caller,
      contract: contract,
      balances,
      events: this.getTxLogs(txReceipt),
    };
    if (customState) {
      log.customState = customState;
    }
    this.logs.push(log);
  }

  resolveAddress(address: string): string {
    const normalizedAddress = address.toLowerCase();
    return this.addressToAccount[normalizedAddress] ||
      this.addressToContract[normalizedAddress] ||
      this.addressToToken[normalizedAddress] ||
      normalizedAddress;
  }

  resolveAddressDeep<T>(data: T): T {
    if (typeof data === "string") {
      return this.resolveAddress(data) as T;
    }
    if (Array.isArray(data)) {
      return data.map(item => this.resolveAddressDeep(item)) as T;
    }
    if (typeof data === "object" && data !== null) {
      return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, this.resolveAddressDeep(value)]),
      ) as T;
    }
    return data;
  }

  printLogs() {
    console.table(this.logs, ["type", "caller", "contract", "name", "args"]);
  }
}
