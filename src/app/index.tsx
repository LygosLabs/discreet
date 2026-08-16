import { Network } from 'bdk-rn';
import { useCallback, useEffect, useState } from 'react';
import { LygosWallet } from 'wallet';
import { Button, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

// ponytail: throwaway M0 gate screen — proves bdk-rn + ddk-rn + wallet build
// and sync under the Expo prebuild. Replaced by the real wallet tab in M1.
const TESTNET4_ESPLORA = 'https://mempool.space/testnet4/api';

export default function HomeScreen() {
  const [status, setStatusState] = useState('M0 gate: not run');
  const setStatus = useCallback((s: string) => {
    console.log(`[m0-gate] ${s}`);
    setStatusState(s);
  }, []);

  const runM0Gate = useCallback(async () => {
    try {
      setStatus('creating testnet4 wallet…');
      const wallet = await LygosWallet.create({
        mnemonic: LygosWallet.generateMnemonic(12),
        network: Network.Testnet4,
        esploraUrl: TESTNET4_ESPLORA,
        dbPath: ':memory:',
      });
      setStatus('syncing…');
      await wallet.fullScan();
      const balance = await wallet.getBalance();
      const { address } = await wallet.getNewAddress();
      setStatus(`PASS — balance ${balance.totalSats} sats\n${address}`);
    } catch (e) {
      setStatus(`FAIL — ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [setStatus]);

  useEffect(() => {
    runM0Gate();
  }, [runM0Gate]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            Discreet
          </ThemedText>
          <ThemedText type="small">P2P bets with DLCs</ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <Button title="Run M0 gate (testnet4 balance)" onPress={runM0Gate} />
          <ThemedText type="code" style={styles.status}>
            {status}
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  status: {
    textAlign: 'center',
  },
});
