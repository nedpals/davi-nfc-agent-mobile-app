import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { colors, fontFamily, radius, shadows, spacing, typography } from "@/constants/theme";
import { useConnection, useServerDiscovery } from "@/hooks";
import { preferredAddress } from "@/services/discovery";
import type { DiscoveredServer } from "@/types/protocol";

function ServerItem({
  server,
  busy,
  onPress,
}: {
  server: DiscoveredServer;
  busy: boolean;
  onPress: () => void;
}) {
  const { version, tls } = server.txtRecords ?? {};

  return (
    <TouchableOpacity
      style={styles.item}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`Connect to ${server.name}`}
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
  const { connectToServer } = useConnection();
  const [connectingTo, setConnectingTo] = useState<string | null>(null);

  const handleSelect = async (server: DiscoveredServer) => {
    setConnectingTo(server.name);
    try {
      await connectToServer(server);
      router.back();
    } catch (error) {
      Alert.alert(
        "Could not connect",
        error instanceof Error ? error.message : "The agent did not answer."
      );
    } finally {
      setConnectingTo(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.action}>Close</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Agents nearby</Text>

        <TouchableOpacity onPress={refresh} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.action}>Refresh</Text>
        </TouchableOpacity>
      </View>

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

      <Text style={styles.footer}>Not listed? Enter the address by hand in Settings.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  title: {
    ...typography.bodyStrong,
    fontSize: 17,
    color: colors.text,
  },
  action: {
    ...typography.body,
    color: colors.accentDeep,
    fontWeight: "600",
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
  footer: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
