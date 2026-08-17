import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { LygosWallet } from 'wallet';
import type { WalletBalance, WalletTransaction } from 'wallet';

import {
  DEFAULT_NETWORK,
  NETWORKS,
  esploraUrlFor,
  type NetworkId,
} from '@/constants/networks';
import { probeAddresses } from '@/lib/address-probe';
import { addressReceived, getAddressStats, getTxStatus } from '@/lib/esplora';

const MNEMONIC_KEY = 'discreet.mnemonic';
const NETWORK_KEY = 'discreet.network';
const LAST_ACTIVE_KEY = (net: NetworkId) => `discreet.lastActive.${net}`;
const SYNCED_AT_KEY = (net: NetworkId) => `discreet.syncedAt.${net}`;
const RECOVERED_KEY = (net: NetworkId) => `discreet.recovered.${net}`;

const POLL_INTERVAL_MS = 20_000;
const STALE_AFTER_MS = 5 * 60_000;
/** BIP44/bdk standard. The scan cost is linear in this, so measure, don't guess. */
const BASE_GAP = 20;

export type ScanPhase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'probing'; checked: number; total: number }
  | { kind: 'scanning' };

/** Unconfirmed money seen by plain HTTP but not yet in a bdk scan. */
export interface IncomingHint {
  address: string;
  sats: bigint;
}

interface WalletState {
  network: NetworkId;
  phase: ScanPhase;
  error?: string;
  balance?: WalletBalance;
  transactions: WalletTransaction[];
  address?: string;
  lastSyncedAt?: number;
  incoming?: IncomingHint;
  esploraUrl: string;
}

interface WalletApi extends WalletState {
  refresh: () => Promise<void>;
  newAddress: () => Promise<string>;
  send: (toAddress: string, amountSats: bigint) => Promise<string>;
  sendAll: (toAddress: string) => Promise<string>;
  switchNetwork: (network: NetworkId) => Promise<void>;
  findMissingFunds: () => Promise<number>;
}

const WalletContext = createContext<WalletApi | null>(null);

async function loadOrCreateMnemonic(): Promise<string> {
  const existing = await SecureStore.getItemAsync(MNEMONIC_KEY);
  if (existing) return existing;
  const mnemonic = LygosWallet.generateMnemonic(12);
  await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return mnemonic;
}

function dbPathFor(network: NetworkId): string {
  return `${Paths.document.uri.replace('file://', '')}wallet-${network}.db`;
}

async function readNumber(key: string): Promise<number | undefined> {
  const raw = await AsyncStorage.getItem(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    network: DEFAULT_NETWORK,
    phase: { kind: 'loading' },
    transactions: [],
    esploraUrl: NETWORKS[DEFAULT_NETWORK].esploraUrl,
  });
  const walletRef = useRef<LygosWallet | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Bumped on every network switch so stale async work can't write state.
  const generationRef = useRef(0);

  const readWallet = useCallback(async (gen: number) => {
    const wallet = walletRef.current;
    if (!wallet || generationRef.current !== gen) return;
    const [balance, transactions, receive] = await Promise.all([
      wallet.getBalance(),
      wallet.listTransactions(),
      wallet.getReceiveAddress(),
    ]);
    if (generationRef.current !== gen) return;
    transactions.sort(
      (a, b) => (b.timestamp ?? Infinity) - (a.timestamp ?? Infinity)
    );
    setState((s) => ({
      ...s,
      phase: { kind: 'idle' },
      balance,
      transactions,
      address: receive.address,
      // A scan is authoritative: drop a hint it has now accounted for.
      incoming: transactions.some((t) => !t.confirmed) ? undefined : s.incoming,
    }));
  }, []);

  const gapFor = useCallback(async (network: NetworkId) => {
    const lastActive = (await readNumber(LAST_ACTIVE_KEY(network))) ?? -1;
    return BigInt(Math.max(BASE_GAP, lastActive + BASE_GAP));
  }, []);

  const scan = useCallback(
    async (gen: number, network: NetworkId) => {
      const wallet = walletRef.current;
      if (!wallet) return;
      setState((s) => ({ ...s, phase: { kind: 'scanning' } }));
      // ponytail: JS-thread liveness probe — mirrors bdk-rn's backgroundSync
      // test. Ticks ~= elapsed/100 means the scan is off-thread; ~0 means the
      // async patches are missing. Cheap enough to leave in.
      const t0 = Date.now();
      let ticks = 0;
      const beat = setInterval(() => ticks++, 100);
      try {
        await wallet.fullScan({ stopGap: await gapFor(network) });
      } finally {
        clearInterval(beat);
        const ms = Date.now() - t0;
        console.log(
          `[wallet] scan ${ms}ms, js ticks ${ticks}/${Math.floor(ms / 100)}`
        );
      }
      if (generationRef.current !== gen) return;
      const now = Date.now();
      await AsyncStorage.setItem(SYNCED_AT_KEY(network), String(now));
      setState((s) => ({ ...s, lastSyncedAt: now }));
      await readWallet(gen);
    },
    [gapFor, readWallet]
  );

  const boot = useCallback(
    async (network: NetworkId) => {
      const gen = ++generationRef.current;
      walletRef.current = null;
      const esploraUrl = await esploraUrlFor(network);
      setState({
        network,
        phase: { kind: 'loading' },
        transactions: [],
        esploraUrl,
      });
      try {
        const mnemonic = await loadOrCreateMnemonic();
        const wallet = await LygosWallet.create({
          mnemonic,
          network: NETWORKS[network].network,
          esploraUrl,
          dbPath: dbPathFor(network),
        });
        if (generationRef.current !== gen) return;
        walletRef.current = wallet;

        // Render from the local db first — opening the app should never wait
        // on the network.
        const lastSyncedAt = await readNumber(SYNCED_AT_KEY(network));
        setState((s) => ({ ...s, lastSyncedAt }));
        await readWallet(gen);

        if (!lastSyncedAt || Date.now() - lastSyncedAt > STALE_AFTER_MS) {
          await scan(gen, network);
        }
      } catch (e) {
        if (generationRef.current !== gen) return;
        setState((s) => ({
          ...s,
          phase: { kind: 'idle' },
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    },
    [readWallet, scan]
  );

  useEffect(() => {
    (async () => {
      const saved = (await AsyncStorage.getItem(NETWORK_KEY)) as NetworkId | null;
      boot(saved && saved in NETWORKS ? saved : DEFAULT_NETWORK);
    })();
  }, [boot]);

  /**
   * Cheap HTTP poll: is the receive address funded, and did any pending tx
   * confirm? One request each, no wallet involvement, so it can run on a
   * timer without ever disturbing the wallet or the UI.
   */
  const cheapCheck = useCallback(async () => {
    const { address, esploraUrl, transactions, network } = stateRef.current;
    const gen = generationRef.current;
    try {
      if (address) {
        const stats = await getAddressStats(esploraUrl, address);
        const { used, receivedSats } = addressReceived(stats);
        if (used && generationRef.current === gen) {
          setState((s) =>
            s.transactions.some((t) => !t.confirmed)
              ? s
              : { ...s, incoming: { address, sats: receivedSats } }
          );
        }
      }
      const pending = transactions.filter((t) => !t.confirmed).slice(0, 3);
      for (const tx of pending) {
        const status = await getTxStatus(esploraUrl, tx.txid);
        if (status.confirmed && generationRef.current === gen) {
          await scan(gen, network);
          break;
        }
      }
    } catch {
      // transient; the next tick retries
    }
  }, [scan]);

  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      if (stateRef.current.phase.kind !== 'idle') return;
      void cheapCheck();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [cheapCheck]);

  const refresh = useCallback(async () => {
    const gen = generationRef.current;
    if (!walletRef.current) return;
    await scan(gen, stateRef.current.network);
  }, [scan]);

  const newAddress = useCallback(async () => {
    const wallet = walletRef.current;
    if (!wallet) throw new Error('wallet not ready');
    const { address } = await wallet.getNewAddress();
    setState((s) => ({ ...s, address }));
    return address;
  }, []);

  const send = useCallback(
    async (toAddress: string, amountSats: bigint) => {
      const wallet = walletRef.current;
      if (!wallet) throw new Error('wallet not ready');
      const txid = await wallet.send(toAddress, amountSats);
      // The wallet applies its own broadcast locally, so a re-read shows the
      // spend and change immediately — no scan needed.
      await readWallet(generationRef.current);
      return txid;
    },
    [readWallet]
  );

  const sendAll = useCallback(
    async (toAddress: string) => {
      const wallet = walletRef.current;
      if (!wallet) throw new Error('wallet not ready');
      const txid = await wallet.sendAll(toAddress);
      await readWallet(generationRef.current);
      return txid;
    },
    [readWallet]
  );

  /**
   * Recovers coins paid to an address beyond the current gap: probe over
   * HTTP to find the true last-active index, reveal up to it, then scan a
   * gap that provably covers it.
   */
  const findMissingFunds = useCallback(async () => {
    const wallet = walletRef.current;
    if (!wallet) throw new Error('wallet not ready');
    const gen = generationRef.current;
    const { network, esploraUrl } = stateRef.current;
    const revealed = wallet.revealedIndex() ?? 0;
    const max = Math.max(NETWORKS[network].probeMax, revealed + BASE_GAP);

    setState((s) => ({ ...s, phase: { kind: 'probing', checked: 0, total: max } }));
    const { lastActiveExternal } = await probeAddresses(wallet, esploraUrl, {
      max,
      onProgress: (checked, total) =>
        setState((s) =>
          s.phase.kind === 'probing'
            ? { ...s, phase: { kind: 'probing', checked, total } }
            : s
        ),
    });

    if (lastActiveExternal >= 0) {
      wallet.revealTo(lastActiveExternal);
      await AsyncStorage.setItem(
        LAST_ACTIVE_KEY(network),
        String(lastActiveExternal)
      );
    }
    await scan(gen, network);
    return lastActiveExternal;
  }, [scan]);

  // Heal installs that were hit by the address-rotation bug: one probe per
  // network, ever.
  useEffect(() => {
    (async () => {
      if (state.phase.kind !== 'idle' || !walletRef.current) return;
      const net = state.network;
      if (await AsyncStorage.getItem(RECOVERED_KEY(net))) return;
      await AsyncStorage.setItem(RECOVERED_KEY(net), '1');
      try {
        await findMissingFunds();
      } catch {
        await AsyncStorage.removeItem(RECOVERED_KEY(net));
      }
    })();
  }, [state.phase.kind, state.network, findMissingFunds]);

  const switchNetwork = useCallback(
    async (network: NetworkId) => {
      await AsyncStorage.setItem(NETWORK_KEY, network);
      await boot(network);
    },
    [boot]
  );

  return (
    <WalletContext.Provider
      value={{
        ...state,
        refresh,
        newAddress,
        send,
        sendAll,
        switchNetwork,
        findMissingFunds,
      }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletApi {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet outside WalletProvider');
  return ctx;
}
