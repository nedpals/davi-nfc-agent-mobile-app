import { View, Text, StyleSheet } from "react-native";
import type { ConnectionStatus as ConnectionStatusType } from "@/types/protocol";

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  serverUrl?: string | null;
}

const statusConfig: Record<
  ConnectionStatusType,
  { color: string; label: string }
> = {
  disconnected: { color: "#6B7280", label: "Disconnected" },
  connecting: { color: "#F59E0B", label: "Connecting..." },
  connected: { color: "#3B82F6", label: "Connected" },
  registered: { color: "#10B981", label: "Registered" },
  reconnecting: { color: "#F59E0B", label: "Reconnecting..." },
  error: { color: "#EF4444", label: "Error" },
};

export function ConnectionStatus({ status, serverUrl }: ConnectionStatusProps) {
  const config = statusConfig[status];

  return (
    <View style={styles.container}>
      <View style={[styles.indicator, { backgroundColor: config.color }]} />
      <View style={styles.textContainer}>
        <Text style={styles.statusText}>{config.label}</Text>
        {serverUrl && status !== "disconnected" && (
          <Text style={styles.serverText} numberOfLines={1}>
            {serverUrl}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    marginHorizontal: 16,
  },
  indicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  serverText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
});
