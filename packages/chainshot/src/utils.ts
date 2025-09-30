import { AddressLike, getAddress, resolveAddress } from "ethers";
import { ScenarioLogRecord } from "./Scenario.js";
import { format as prettyFormat } from "pretty-format";

function limitStringLength(str: string, limit: number): string {
  if (str.length <= limit) return str;
  const halfLimit = Math.floor(limit / 2);
  return str.slice(0, halfLimit) + ".." + str.slice(-halfLimit);
}

export async function revertMap<K extends string, R>(
  map: Record<K, R>,
  mapper: (value: R) => string | Promise<string>,
): Promise<Record<string, K>> {
  return Promise.all(
    Object.entries<R>(map)
      .map(async ([key, value]) => [await mapper(value), key]),
  )
    .then(Object.fromEntries);
}

export async function normalizeAddressAsync(address: AddressLike): Promise<string> {
  return normalizeAddress(
    await resolveAddress(address),
  );
}

export function normalizeAddress(address: string): string {
  return getAddress(address).toLowerCase();
}

export function onlyOneRunning(fn: () => Promise<void>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      return;
    }
    running = true;
    await fn();
    running = false;
  };
}

export function mapRecordValues<T, R, K extends string>(
  record: Record<K, T>,
  mapper: (name: K, value: T) => R,
): Record<K, R> {
  return Object.fromEntries(
    Object.entries(record).map(([name, value]) => [name, mapper(name as K, value as T)]),
  ) as Record<K, R>;
}

const knownConstants = {
  "0x0000000000000000000000000000000000000000": "ZERO_ADDR",
  "0x0000000000000000000000000000000000000000000000000000000000000000": "ZERO",
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff": "MAX_UINT256",
} as const;

export function strigifyLogArgumentsVerbose(log: ScenarioLogRecord): string {
  const result: Record<string, string> = {};
  for (let i = 0; i < log.methodFragment.inputs.length; i++) {
    const arg = log.methodFragment.inputs[i];
    result[stringifyValue(arg.name)] = stringifyValue(log.args[i]);
  }
  return JSON.stringify(result, null, 2);
}

export function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    const resolvedKnownConstant = knownConstants[value.toLowerCase() as keyof typeof knownConstants];
    return resolvedKnownConstant ?? limitStringLength(value, 20);
  };

  if (typeof value === "bigint") {
    return stringifyValue(value.toString());
  };

  if (Array.isArray(value)) return `[${value.map(stringifyValue).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value, (_, v) => stringifyValue(v));
    } catch {
      return stringifyValue(String(value));
    }
  }
  return stringifyValue(String(value));
}

export function stringifyInline(value: unknown): string {
  return stringifyValue(value);
};

export function stringifyMultiline(value: unknown): string {
  return prettyFormat(value);
};
