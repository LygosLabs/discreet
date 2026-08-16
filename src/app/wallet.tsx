import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import {
  Alert,
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NETWORKS, type NetworkId } from '@/constants/networks';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWallet } from '@/lib/wallet-context';

function sats(v?: bigint): string {
  return v === undefined ? '—' : `${v.toLocaleString()} sats`;
}

export default function WalletScreen() {
  const wallet = useWallet();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const confirmSwitch = (target: NetworkId) => {
    if (target === wallet.network) return;
    if (target === 'bitcoin') {
      Alert.alert(
        'Switch to mainnet?',
        'Real bitcoin. Bets are final. Are you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Switch',
            style: 'destructive',
            onPress: () => wallet.switchNetwork(target),
          },
        ]
      );
    } else {
      wallet.switchNetwork(target);
    }
  };

  const doSend = async (all: boolean) => {
    try {
      if (!to.trim()) throw new Error('recipient address required');
      setBusy(true);
      const txid = all
        ? await wallet.sendAll(to.trim())
        : await wallet.send(to.trim(), BigInt(amount || '0'));
      setTo('');
      setAmount('');
      Alert.alert('Broadcast', `txid:\n${txid}`);
    } catch (e) {
      Alert.alert('Send failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = async () => {
    if (!wallet.address) return;
    await Clipboard.setStringAsync(wallet.address);
    Alert.alert('Copied', wallet.address);
  };

  const input = {
    backgroundColor: theme.backgroundElement,
    color: theme.text,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + Spacing.four,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}>
      <ThemedView style={styles.headerRow}>
        <ThemedText type="title">Wallet</ThemedText>
        <ThemedView style={styles.networkRow}>
          {(Object.keys(NETWORKS) as NetworkId[]).map((id) => (
            <Pressable
              key={id}
              onPress={() => confirmSwitch(id)}
              style={[
                styles.networkPill,
                {
                  backgroundColor:
                    id === wallet.network ? theme.text : theme.backgroundElement,
                },
              ]}>
              <ThemedText
                type="smallBold"
                style={{
                  color: id === wallet.network ? theme.background : theme.text,
                }}>
                {NETWORKS[id].label}
              </ThemedText>
            </Pressable>
          ))}
        </ThemedView>
      </ThemedView>

      {wallet.network === 'bitcoin' && (
        <ThemedView style={[styles.card, styles.mainnetBanner]}>
          <ThemedText type="smallBold" style={styles.mainnetText}>
            MAINNET — real funds
          </ThemedText>
        </ThemedView>
      )}

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {wallet.status === 'error'
            ? `error: ${wallet.error}`
            : wallet.status}
        </ThemedText>
        <ThemedText type="title">{sats(wallet.balance?.totalSats)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          spendable {sats(wallet.balance?.spendableSats)} · pending{' '}
          {sats(wallet.balance?.untrustedPendingSats)}
        </ThemedText>
        <Button title="Refresh" onPress={wallet.refresh} />
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle">Receive</ThemedText>
        <Pressable onPress={copyAddress}>
          <ThemedText type="code" style={styles.address}>
            {wallet.address ?? '…'}
          </ThemedText>
        </Pressable>
        <ThemedView style={styles.buttonRow}>
          <Button title="Copy" onPress={copyAddress} />
          <Button title="New address" onPress={() => wallet.newAddress()} />
        </ThemedView>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle">Send</ThemedText>
        <TextInput
          style={input}
          placeholder={`${NETWORKS[wallet.network].addressPrefix}… address`}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          value={to}
          onChangeText={setTo}
        />
        <TextInput
          style={input}
          placeholder="amount (sats)"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
        />
        <ThemedView style={styles.buttonRow}>
          <Button title="Send" disabled={busy} onPress={() => doSend(false)} />
          <Button
            title="Send all"
            disabled={busy}
            onPress={() =>
              Alert.alert('Send everything?', 'Sweeps the whole balance.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send all', style: 'destructive', onPress: () => doSend(true) },
              ])
            }
          />
        </ThemedView>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle">History</ThemedText>
        {wallet.transactions.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No transactions yet.
          </ThemedText>
        )}
        {wallet.transactions.map((tx) => {
          const net = tx.receivedSats - tx.sentSats;
          return (
            <ThemedView key={tx.txid} style={styles.txRow}>
              <ThemedView style={styles.txMain}>
                <ThemedText type="smallBold">
                  {net >= 0n ? '+' : ''}
                  {sats(net)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {tx.label ??
                    (tx.confirmed
                      ? `block ${tx.blockHeight}`
                      : 'unconfirmed')}
                </ThemedText>
              </ThemedView>
              <ThemedText type="small" themeColor="textSecondary">
                {tx.txid.slice(0, 10)}…
              </ThemedText>
            </ThemedView>
          );
        })}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  networkRow: { flexDirection: 'row', gap: Spacing.two },
  networkPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  mainnetBanner: { backgroundColor: '#7f1d1d' },
  mainnetText: { color: '#fecaca', textAlign: 'center' },
  address: { flexWrap: 'wrap' },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'transparent',
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  txMain: { backgroundColor: 'transparent' },
});
