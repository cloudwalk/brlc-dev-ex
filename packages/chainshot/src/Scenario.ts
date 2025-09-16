import { type HardhatRuntimeEnvironment } from "hardhat/types";
import type { BaseContract, Log, TransactionReceipt, FunctionFragment } from "ethers";
import { getBigInt } from "ethers";
import { normalizeAddress, revertMap } from "./utils.js";

type HREProvider = HardhatRuntimeEnvironment["ethers"]["provider"];
interface TxRecord {
  txHash: string;
  methodFragment: FunctionFragment;
  contract: string;
  caller: string;
  args: unknown[];
}

export interface ScenarioConfig {
  name?: string;
  accounts: Record<string, string>;
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
}

export type ScenarioLogs = ScenarioLogRecord[] & { [ScenarioLogsSymbol]?: true };

export const ScenarioLogsSymbol = Symbol("ScenarioLogs");
export class Scenario {
  public test: Mocha.Test;
  public name: string;
  public config: ScenarioConfig;
  public logs: ScenarioLogs = [] as ScenarioLogs;

  private addressToContract: Record<string, string>;
  private addressToToken: Record<string, string>;
  private addressToAccount: Record<string, string>;
  private originalSend: HREProvider["send"];
  private transactionsQueue: TxRecord[] = [];
  private decimalsCache: Record<string, number> = {};

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
    this.addressToContract = revertMap(this.config.contracts, contract => normalizeAddress(contract.target));
    this.addressToToken = revertMap(this.config.tokens, contract => normalizeAddress(contract.target));
    this.addressToAccount = revertMap(this.config.accounts, normalizeAddress);
    this.config = options.config;
    this.logs[ScenarioLogsSymbol] = true;
    this.name = options.name || this.generateNameFromTest(this.test);
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
        this.queueTx(txHash, transaction);
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

  private getAllBalanceHolders(): Record<string, string> {
    const balanceHolders: Record<string, string> = {};
    for (const [name, contract] of Object.entries(this.getAllContracts())) {
      balanceHolders[name] = normalizeAddress(contract.target as string);
    }
    for (const [name, account] of Object.entries(this.config.accounts)) {
      balanceHolders[name] = normalizeAddress(account);
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

      for (const [accountName, accountAddress] of Object.entries(this.getAllBalanceHolders())) {
        const balance = await getBalanceForToken(accountAddress);
        tokenBalances[accountName] = balance;
      }
      balances[name] = tokenBalances;
    }

    return balances;
  }

  async processTxs() {
    for (const methodCalled of this.transactionsQueue) {
      const txReceipt = await this.hre.ethers.provider.getTransactionReceipt(methodCalled.txHash);
      if (txReceipt === null) {
        // TODO maybe log it with fail status??
        console.warn("Transaction receipt is null", methodCalled);
        continue;
        // throw new Error("Transaction receipt is null");
      }
      this.logs.push({
        type: "methodCall",
        methodFragment: methodCalled.methodFragment,
        args: methodCalled.args,
        caller: methodCalled.caller,
        contract: methodCalled.contract,
        balances: await this.getBalances(txReceipt),
        events: this.getTxLogs(txReceipt),
      });
    }
    this.transactionsQueue = [];
  };

  resolveAddress(address: string): string {
    const normalizedAddress = normalizeAddress(address);
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

  queueTx(txHash: string, data: { from: string; to: string; data: string }) {
    const caller = this.resolveAddress(data.from);
    const contract = this.resolveAddress(data.to);
    const contractInstance: BaseContract | undefined = this.config.contracts[contract];
    const parsedData = contractInstance?.interface.parseTransaction({ data: data.data });
    const methodFragment = parsedData?.fragment as FunctionFragment;
    if (!methodFragment) {
      throw new Error("Failed to parse method fragment");
    }
    const args = parsedData?.args;
    this.transactionsQueue.push({
      txHash,
      methodFragment: methodFragment,
      contract,
      caller,
      args: args ? this.resolveAddressDeep(args) : [],
    });
  }

  printLogs() {
    console.table(this.logs, ["type", "caller", "contract", "name", "args"]);
  }
}
