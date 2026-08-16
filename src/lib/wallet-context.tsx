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
import { LygosWallet } from 'wallet';
import type { WalletBalance, WalletTransaction } from 'wallet';

import { DEFAULT_NETWORK, NETWORKS, type NetworkId } from '@/constants/networks';

const MNEMONIC_KEY = 'discreet.mnemonic';
const NETWORK_KEY = 'discreet.network';
const SCANNED_KEY = (net: NetworkId) => `discreet.scanned.${net}`;
const SYNC_INTERVAL_MS = 30_000;

interface WalletState {
  network: NetworkId;
  status: 'loading' | 'syncing' | 'ready' | 'error';
  error?: string;
  balance?: WalletBalance;
  transactions: WalletTransaction[];
  address?: string;
}

interface WalletApi extends WalletState {
  refresh: () => Promise<void>;
  newAddress: () => Promise<string>;
  send: (toAddress: string, amountSats: bigint) => Promise<string>;
  sendAll: (toAddress: string) => Promise<string>;
  switchNetwork: (network: NetworkId) => Promise<void>;
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

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    network: DEFAULT_NETWORK,
    status: 'loading',
    transactions: [],
  });
  const walletRef = useRef<LygosWallet | null>(null);
  // Bumped on every network switch so stale async work can't write state.
  const generationRef = useRef(0);

  const readWallet = useCallback(async (gen: number) => {
    const wallet = walletRef.current;
    if (!wallet || generationRef.current !== gen) return;
    const [balance, transactions, { address }] = await Promise.all([
      wallet.getBalance(),
      wallet.listTransactions(),
      wallet.getNewAddress(),
    ]);
    if (generationRef.current !== gen) return;
    transactions.sort((a, b) => (b.timestamp ?? Infinity) < (a.timestamp ?? Infinity) ? -1 : 1);
    setState((s) => ({ ...s, status: 'ready', balance, transactions, address }));
  }, []);

  const boot = useCallback(
    async (network: NetworkId) => {
      const gen = ++generationRef.current;
      walletRef.current = null;
      setState({ network, status: 'loading', transactions: [] });
      try {
        const mnemonic = await loadOrCreateMnemonic();
        const wallet = await LygosWallet.create({
          mnemonic,
          network: NETWORKS[network].network,
          esploraUrl: NETWORKS[network].esploraUrl,
          dbPath: dbPathFor(network),
        });
        if (generationRef.current !== gen) return;
        walletRef.current = wallet;
        setState((s) => ({ ...s, status: 'syncing' }));
        const scanned = await AsyncStorage.getItem(SCANNED_KEY(network));
        if (scanned) {
          await wallet.sync();
        } else {
          await wallet.fullScan();
          await AsyncStorage.setItem(SCANNED_KEY(network), '1');
        }
        await readWallet(gen);
      } catch (e) {
        if (generationRef.current !== gen) return;
        setState((s) => ({
          ...s,
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    },
    [readWallet]
  );

  useEffect(() => {
    (async () => {
      const saved = (await AsyncStorage.getItem(NETWORK_KEY)) as NetworkId | null;
      boot(saved && saved in NETWORKS ? saved : DEFAULT_NETWORK);
    })();
  }, [boot]);

  useEffect(() => {
    const id = setInterval(async () => {
      const gen = generationRef.current;
      const wallet = walletRef.current;
      if (!wallet) return;
      try {
        await wallet.sync();
        await readWallet(gen);
      } catch {
        // transient esplora failures — next tick retries
      }
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [readWallet]);

  const refresh = useCallback(async () => {
    const gen = generationRef.current;
    const wallet = walletRef.current;
    if (!wallet) return;
    setState((s) => ({ ...s, status: 'syncing' }));
    await wallet.sync();
    await readWallet(gen);
  }, [readWallet]);

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
      await refresh();
      return txid;
    },
    [refresh]
  );

  const sendAll = useCallback(
    async (toAddress: string) => {
      const wallet = walletRef.current;
      if (!wallet) throw new Error('wallet not ready');
      const txid = await wallet.sendAll(toAddress);
      await refresh();
      return txid;
    },
    [refresh]
  );

  const switchNetwork = useCallback(
    async (network: NetworkId) => {
      await AsyncStorage.setItem(NETWORK_KEY, network);
      await boot(network);
    },
    [boot]
  );

  return (
    <WalletContext.Provider
      value={{ ...state, refresh, newAddress, send, sendAll, switchNetwork }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletApi {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet outside WalletProvider');
  return ctx;
}
