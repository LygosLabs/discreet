import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Pressable,
  RefreshControl,
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

function ago(at?: number): string {
  if (!at) return 'never';
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function WalletScreen() {
  const wallet = useWallet();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const phase = wallet.phase;
  const working = phase.kind !== 'idle';
  const pendingSats =
    wallet.balance &&
    wallet.balance.trustedPendingSats + wallet.balance.untrustedPendingSats;

  const confirmSwitch = (target: NetworkId) => {
    if (target === wallet.network || working) return;
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

  const recover = async () => {
    try {
      const last = await wallet.findMissingFunds();
      Alert.alert(
        'Scan complete',
        last < 0
          ? 'No payments found to any address in this wallet.'
          : `Highest used address: index ${last}. Balance updated.`
      );
    } catch (e) {
      Alert.alert('Scan failed', e instanceof Error ? e.message : String(e));
    }
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
      refreshControl={
        <RefreshControl
          refreshing={phase.kind === 'scanning'}
          onRefresh={wallet.refresh}
          tintColor={theme.textSecondary}
        />
      }
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
                  opacity: working && id !== wallet.network ? 0.4 : 1,
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
        <ThemedView style={styles.balanceRow}>
          <ThemedText type="title" style={{ opacity: working ? 0.45 : 1 }}>
            {sats(wallet.balance?.totalSats)}
          </ThemedText>
          {working && <ActivityIndicator />}
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">
          spendable {sats(wallet.balance?.spendableSats)}
          {pendingSats !== undefined && pendingSats > 0n
            ? ` · pending ${sats(pendingSats)}`
            : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {phase.kind === 'probing'
            ? `Checking addresses ${phase.checked}/${phase.total}`
            : phase.kind === 'scanning'
              ? 'Scanning the chain…'
              : phase.kind === 'loading'
                ? 'Opening wallet…'
                : wallet.error
                  ? `error: ${wallet.error}`
                  : `Updated ${ago(wallet.lastSyncedAt)}`}
        </ThemedText>
        <Button title="Refresh" disabled={working} onPress={wallet.refresh} />
      </ThemedView>

      {wallet.incoming && (
        <ThemedView type="backgroundElement" style={[styles.card, styles.incoming]}>
          <ThemedText type="smallBold">
            ≈ +{wallet.incoming.sats.toLocaleString()} sats seen on chain
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Not counted in the balance until a sync confirms it.
          </ThemedText>
          <Button title="Sync now" disabled={working} onPress={wallet.refresh} />
        </ThemedView>
      )}

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle">Receive</ThemedText>
        <Pressable onPress={copyAddress}>
          <ThemedText type="code" style={styles.address}>
            {wallet.address ?? '…'}
          </ThemedText>
        </Pressable>
        <ThemedView style={styles.buttonRow}>
          <Button title="Copy" onPress={copyAddress} />
          <Button
            title="New address"
            disabled={working}
            onPress={() => wallet.newAddress()}
          />
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
          <Button
            title="Send"
            disabled={busy || working}
            onPress={() => doSend(false)}
          />
          <Button
            title="Send all"
            disabled={busy || working}
            onPress={() =>
              Alert.alert('Send everything?', 'Sweeps the whole balance.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Send all',
                  style: 'destructive',
                  onPress: () => doSend(true),
                },
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
                    (tx.confirmed ? `block ${tx.blockHeight}` : 'pending')}
                </ThemedText>
              </ThemedView>
              <ThemedText type="small" themeColor="textSecondary">
                {tx.txid.slice(0, 10)}…
              </ThemedText>
            </ThemedView>
          );
        })}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          Missing a payment? A deep scan checks every address this wallet has
          ever handed out.
        </ThemedText>
        <Button
          title="Find missing funds"
          disabled={working}
          onPress={recover}
        />
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
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: 'transparent',
  },
  incoming: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#d97706' },
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
