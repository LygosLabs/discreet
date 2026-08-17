import type { LygosWallet } from 'wallet';

import { RateLimitedError, addressReceived, getAddressStats } from './esplora';

/**
 * Finds the highest address index that has ever been paid, by deriving
 * addresses locally (`peekAddress` does no I/O) and asking esplora about
 * each one over ordinary async HTTP.
 *
 * This exists because a `fullScan` stops after `stopGap` consecutive unused
 * addresses: a payment sitting beyond that gap is invisible to bdk and no
 * amount of scanning finds it. The probe measures the real last-active index
 * so the wallet can reveal up to it and sync a bounded set instead of
 * guessing an ever-larger gap.
 */
export interface ProbeResult {
  lastActiveExternal: number; // -1 when nothing was ever used
  checked: number;
}

const CONCURRENCY = 4;
const BATCH_PAUSE_MS = 100;

export async function probeAddresses(
  wallet: LygosWallet,
  esploraUrl: string,
  opts: { max: number; onProgress?: (checked: number, total: number) => void }
): Promise<ProbeResult> {
  let lastActive = -1;
  let checked = 0;

  for (let start = 0; start < opts.max; start += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, opts.max - start) },
      (_, i) => start + i
    );

    const results = await Promise.all(
      batch.map(async (index) => {
        const address = wallet.peekAddress(index);
        const stats = await getAddressStats(esploraUrl, address);
        return { index, used: addressReceived(stats).used };
      })
    );

    for (const { index, used } of results) {
      if (used) lastActive = Math.max(lastActive, index);
    }
    checked += batch.length;
    opts.onProgress?.(checked, opts.max);

    await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
  }

  return { lastActiveExternal: lastActive, checked };
}

export { RateLimitedError };
