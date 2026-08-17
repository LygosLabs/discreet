/**
 * Plain-fetch esplora reads. Separate from bdk's own esplora client on
 * purpose: these are ordinary async HTTP, so they answer "did I get paid?"
 * and "did my tx confirm?" without touching the wallet or a chain scan.
 * bdk stays the authority on balances — nothing here writes into one.
 */
const TIMEOUT_MS = 10_000;

async function get<T>(base: string, path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal });
    if (res.status === 429) throw new RateLimitedError(path);
    if (!res.ok) throw new Error(`esplora ${path}: ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Thrown on 429 so callers can tell "rate limited" from "address unused". */
export class RateLimitedError extends Error {
  constructor(path: string) {
    super(`esplora rate limited: ${path}`);
    this.name = 'RateLimitedError';
  }
}

interface Stats {
  tx_count: number;
  funded_txo_sum: number;
  spent_txo_sum: number;
}

export interface AddressStats {
  chain_stats: Stats;
  mempool_stats: Stats;
}

export const getAddressStats = (base: string, address: string) =>
  get<AddressStats>(base, `/address/${address}`);

export const getTxStatus = (base: string, txid: string) =>
  get<{ confirmed: boolean; block_height?: number }>(base, `/tx/${txid}/status`);

/** Total sats received (confirmed + mempool), and whether the address is used. */
export function addressReceived(stats: AddressStats): {
  used: boolean;
  receivedSats: bigint;
  pendingSats: bigint;
} {
  const confirmed = BigInt(stats.chain_stats.funded_txo_sum);
  const pending = BigInt(stats.mempool_stats.funded_txo_sum);
  return {
    used: stats.chain_stats.tx_count + stats.mempool_stats.tx_count > 0,
    receivedSats: confirmed + pending,
    pendingSats: pending,
  };
}
