import type { ConnectionStatus as ConnectionStatusType } from "@/types/protocol";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  serverUrl?: string | null;
  deviceName?: string;
  isSearching?: boolean;
  onPress?: () => void;
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

export function ConnectionStatus({ status, serverUrl, deviceName, isSearching, onPress }: ConnectionStatusProps) {
  // Default to disconnected if status is undefined (during store hydration)
  const config = statusConfig[status] ?? statusConfig.disconnected;

  const getStatusLabel = () => {
    if (status === "registered" && deviceName) {
      return `Registered as "${deviceName}"`;
    }
    return config.label;
  };

  const getSubText = () => {
    if (serverUrl && status !== "disconnected") {
      return serverUrl;
    }
    if (isSearching) {
      return "Searching for servers...";
    }
    if (status === "disconnected") {
      return "Tap to find servers";
    }
    return null;
  };

  const subText = getSubText();
  const showSpinner = isSearching && status === "disconnected";

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {showSpinner ? (
        <ActivityIndicator size="small" color="#3B82F6" style={styles.spinner} />
      ) : (
        <View style={[styles.indicator, { backgroundColor: config.color }]} />
      )}
      <View style={styles.textContainer}>
        <Text style={styles.statusText}>{getStatusLabel()}</Text>
        {subText && (
          <Text style={styles.serverText} numberOfLines={1}>
            {subText}
          </Text>
        )}
      </View>
      {onPress && (
        <Text style={styles.arrow}>›</Text>
      )}
    </TouchableOpacity>
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
  spinner: {
    width: 12,
    height: 12,
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
  arrow: {
    fontSize: 20,
    color: "#9CA3AF",
    marginLeft: 8,
  },
});
