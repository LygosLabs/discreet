import { Network } from 'bdk-rn';

export type NetworkId = 'testnet4' | 'bitcoin';

export const NETWORKS: Record<
  NetworkId,
  { network: Network; esploraUrl: string; label: string; addressPrefix: string }
> = {
  testnet4: {
    network: Network.Testnet4,
    esploraUrl: 'https://mempool.space/testnet4/api',
    label: 'Testnet4',
    addressPrefix: 'tb1',
  },
  bitcoin: {
    network: Network.Bitcoin,
    esploraUrl: 'https://mempool.space/api',
    label: 'Mainnet',
    addressPrefix: 'bc1',
  },
};

export const DEFAULT_NETWORK: NetworkId = 'testnet4';
