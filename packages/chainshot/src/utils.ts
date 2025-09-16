import { Addressable } from "ethers";
import { ScenarioLogRecord } from "./Scenario.js";

function limitStringLength(str: string, limit: number): string {
  if (str.length <= limit) return str;
  const halfLimit = Math.floor(limit / 2);
  return str.slice(0, halfLimit) + ".." + str.slice(-halfLimit);
}

export function revertMap<K extends string, R>(map: Record<K, R>, mapper: (value: R) => string): Record<string, K> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [mapper(value as R), key])) as Record<string, K>;
}

export function normalizeAddress(address: string | Addressable): string {
  return address.toString().toLowerCase();
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
