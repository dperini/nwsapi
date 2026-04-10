export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function assertNever(x: never): never {
  throw new Error(`Unexpected key: ${x}`);
}
