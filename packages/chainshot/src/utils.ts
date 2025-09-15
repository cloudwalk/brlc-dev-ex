import { Addressable } from "ethers";

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

export function stringifyValue(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[${value.map(stringifyValue).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
