import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ModalHeader } from "@/components/ModalHeader";
import { colors, fontFamily, radius, shadows, spacing, typography } from "@/constants/theme";
import { hostFromAgentUrl } from "@/services/agent-url";
import { useConnection, usePairing, useServerDiscovery } from "@/hooks";
import { discoveryService, preferredAddress } from "@/services/discovery";
import type { DiscoveredServer } from "@/types/protocol";

function ServerItem({
  server,
  busy,
  paired,
  onPress,
}: {
  server: DiscoveredServer;
  busy: boolean;
  paired: boolean;
  onPress: () => void;
}) {
  const { version, tls } = server.txtRecords ?? {};

  return (
    <TouchableOpacity
      style={styles.item}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={paired ? `Connect to ${server.name}` : `Pair with ${server.name}`}
    >
      <View style={styles.itemText}>
        <Text style={styles.itemName} numberOfLines={1}>
          {server.name}
        </Text>
        <Text style={styles.itemAddress} numberOfLines={1}>
          {preferredAddress(server)}:{server.port}
        </Text>
        <View style={styles.tags}>
          {version ? <Text style={styles.tag}>v{version}</Text> : null}
          <Text style={styles.tag}>{tls === "false" ? "No TLS" : "TLS"}</Text>
          {paired ? <Text style={[styles.tag, styles.tagPaired]}>Paired</Text> : null}
        </View>
      </View>

      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      )}
    </TouchableOpacity>
  );
}

export default function ServerListScreen() {
  const router = useRouter();
  const { servers, isSearching, refresh } = useServerDiscovery({ autoStart: true });
  const { connect, connectToServer } = useConnection();
  const { pairing } = usePairing();
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [isDialling, setIsDialling] = useState(false);

  const dial = async (attempt: () => Promise<void>) => {
    try {
      await attempt();
      router.back();
    } catch (error) {
      Alert.alert(
        "Could not connect",
        error instanceof Error ? error.message : "The agent did not answer."
      );
    }
  };

  // Pairing is how a device learns the agent's key and gets a credential, so
  // an agent this one has not paired with is a pairing step, not a doomed
  // connection followed by a hunt through Settings for the PIN field.
  const handleSelect = async (server: DiscoveredServer) => {
    const host = preferredAddress(server);

    if (pairing?.host !== host) {
      router.push({
        pathname: "/(modals)/pair",
        params: {
          host,
          port: String(server.port || ""),
          name: server.name,
          url: discoveryService.buildWebSocketUrl(server),
        },
      });
      return;
    }

    setConnectingTo(server.name);
    try {
      await dial(() => connectToServer(server));
    } finally {
      setConnectingTo(null);
    }
  };

  // An agent on a network that carries no mDNS never appears in the list, and
  // sending someone to another screen to type its address is a detour this
  // screen can absorb.
  const handleDial = async () => {
    const target = address.trim();
    if (!target) {
      Alert.alert("Address required", "Enter the agent's address, such as 192.168.1.100:9470.");
      return;
    }

    const host = hostFromAgentUrl(target);
    if (pairing?.host !== host) {
      router.push({ pathname: "/(modals)/pair", params: { host, url: target } });
      return;
    }

    setIsDialling(true);
    try {
      await dial(() => connect(target));
    } finally {
      setIsDialling(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ModalHeader
        title="Agents nearby"
        onClose={() => router.back()}
        actionLabel="Refresh"
        onAction={refresh}
      />

      {isSearching && (
        <View style={styles.banner}>
          <ActivityIndicator size="small" color={colors.accentDeep} />
          <Text style={styles.bannerText}>Browsing the local network…</Text>
        </View>
      )}

      <FlatList
        data={servers}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => (
          <ServerItem
            server={item}
            busy={connectingTo === item.name}
            paired={pairing?.host === preferredAddress(item)}
            onPress={() => handleSelect(item)}
          />
        )}
        contentContainerStyle={[styles.list, servers.length === 0 && styles.listEmpty]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          isSearching ? (
            <EmptyState
              title="Looking for agents"
              message="The agent advertises itself over mDNS on the network it is running on."
            />
          ) : (
            <EmptyState
              title="No agents found"
              message="Check that the agent is running and that this phone is on the same network."
              actionLabel="Search again"
              onAction={refresh}
            />
          )
        }
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.manual}>
          <Text style={styles.manualLabel}>Not listed? Enter its address</Text>
          <View style={styles.manualRow}>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="192.168.1.100:9470"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={handleDial}
            />
            <Button
              label={isDialling ? "Connecting…" : "Connect"}
              onPress={handleDial}
              loading={isDialling}
              style={styles.manualButton}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  bannerText: {
    ...typography.caption,
    color: colors.accentDeep,
  },
  list: {
    padding: spacing.lg,
  },
  listEmpty: {
    flexGrow: 1,
  },
  separator: {
    height: spacing.md,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  itemText: {
    flex: 1,
  },
  itemName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  itemAddress: {
    ...typography.caption,
    fontFamily: fontFamily.mono,
    color: colors.textMuted,
    marginTop: 2,
  },
  tags: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  tag: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  tagPaired: {
    color: colors.accentDeep,
    backgroundColor: colors.accentSoft,
  },
  manual: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  manualLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  manualRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  manualButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
});
