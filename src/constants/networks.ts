import AsyncStorage from '@react-native-async-storage/async-storage';
import { Network } from 'bdk-rn';

export type NetworkId = 'testnet4' | 'bitcoin';

export const NETWORKS: Record<
  NetworkId,
  {
    network: Network;
    esploraUrl: string;
    label: string;
    addressPrefix: string;
    probeMax: number;
  }
> = {
  testnet4: {
    network: Network.Testnet4,
    // No Lygos testnet4 esplora exists (their batch host serves only a custom
    // POST route, node.lygos.finance is mainnet) — lygos-app uses this too.
    esploraUrl: 'https://mempool.space/testnet4/api',
    label: 'Testnet4',
    addressPrefix: 'tb1',
    probeMax: 80,
  },
  bitcoin: {
    network: Network.Bitcoin,
    // Lygos' own electrs — no public rate limit, unlike mempool.space.
    esploraUrl: 'https://node.lygos.finance/api',
    label: 'Mainnet',
    addressPrefix: 'bc1',
    probeMax: 80,
  },
};

export const DEFAULT_NETWORK: NetworkId = 'testnet4';

const ENV_OVERRIDE: Partial<Record<NetworkId, string | undefined>> = {
  testnet4: process.env.EXPO_PUBLIC_ESPLORA_TESTNET4,
  bitcoin: process.env.EXPO_PUBLIC_ESPLORA_BITCOIN,
};

/** Precedence: saved override (dev settings) > EXPO_PUBLIC_* env > default. */
export async function esploraUrlFor(network: NetworkId): Promise<string> {
  const saved = await AsyncStorage.getItem(`discreet.esplora.${network}`);
  return (
    saved?.trim() || ENV_OVERRIDE[network] || NETWORKS[network].esploraUrl
  );
}
