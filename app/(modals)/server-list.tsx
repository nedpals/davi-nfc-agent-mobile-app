import { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useServerDiscovery, useConnection } from "@/hooks";
import type { DiscoveredServer } from "@/types/protocol";

function ServerItem({
  server,
  onPress,
}: {
  server: DiscoveredServer;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.serverItem} onPress={onPress}>
      <View style={styles.serverInfo}>
        <Text style={styles.serverName}>{server.name}</Text>
        <Text style={styles.serverAddress}>
          {server.host}:{server.port}
        </Text>
        {server.txtRecords.version && (
          <Text style={styles.serverVersion}>v{server.txtRecords.version}</Text>
        )}
      </View>
      <Text style={styles.arrow}>→</Text>
    </TouchableOpacity>
  );
}

export default function ServerListScreen() {
  const router = useRouter();
  const { servers, isSearching, startDiscovery, stopDiscovery, refresh } =
    useServerDiscovery();
  const { connectToServer } = useConnection();

  useEffect(() => {
    startDiscovery();
    return () => stopDiscovery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectServer = async (server: DiscoveredServer) => {
    stopDiscovery();
    try {
      await connectToServer(server);
      Alert.alert("Connected", `Connected to ${server.name}`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(
        "Connection Failed",
        error instanceof Error ? error.message : "Failed to connect"
      );
      // Resume discovery
      startDiscovery();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.closeButton}>Close</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Find Servers</Text>
        <TouchableOpacity onPress={refresh}>
          <Text style={styles.refreshButton}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {isSearching && (
        <View style={styles.searchingBanner}>
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text style={styles.searchingText}>Searching for servers...</Text>
        </View>
      )}

      <FlatList
        data={servers}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => (
          <ServerItem server={item} onPress={() => handleSelectServer(item)} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {isSearching ? (
              <Text style={styles.emptyText}>
                Looking for NFC Agent servers on your network...
              </Text>
            ) : (
              <>
                <Text style={styles.emptyText}>No servers found</Text>
                <Text style={styles.emptySubtext}>
                  Make sure the NFC Agent server is running and you&apos;re on the
                  same network
                </Text>
                <TouchableOpacity style={styles.retryButton} onPress={refresh}>
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Can&apos;t find your server? Enter the URL manually in Settings.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  closeButton: {
    fontSize: 16,
    color: "#3B82F6",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
  },
  refreshButton: {
    fontSize: 16,
    color: "#3B82F6",
  },
  searchingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#EFF6FF",
    gap: 8,
  },
  searchingText: {
    color: "#3B82F6",
    fontSize: 14,
  },
  list: {
    padding: 16,
    flexGrow: 1,
  },
  serverItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  serverInfo: {
    flex: 1,
  },
  serverName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
  },
  serverAddress: {
    fontSize: 14,
    color: "#6B7280",
    fontFamily: "monospace",
  },
  serverVersion: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  arrow: {
    fontSize: 20,
    color: "#9CA3AF",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 8,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: "#3B82F6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  footerText: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
