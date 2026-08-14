import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, shadows, spacing, typography } from "@/constants/theme";
import { WS_CONFIG } from "@/constants/config";
import type { ConnectionStatus as ConnectionStatusType } from "@/types/protocol";

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  serverUrl?: string | null;
  deviceName?: string;
  error?: string | null;
  reconnectAttempt?: number;
  isSearching?: boolean;
  isOnline?: boolean;
  onPress?: () => void;
  // Offered when the connection has given up and there is something to try.
  onRetry?: () => void;
}

const statusColor: Record<ConnectionStatusType, string> = {
  disconnected: colors.neutral,
  connecting: colors.warning,
  connected: colors.accent,
  registered: colors.success,
  reconnecting: colors.warning,
  error: colors.danger,
};

export function ConnectionStatus({
  status,
  serverUrl,
  deviceName,
  error,
  reconnectAttempt = 0,
  isSearching,
  isOnline = true,
  onPress,
  onRetry,
}: ConnectionStatusProps) {
  const color = statusColor[status] ?? statusColor.disconnected;
  const busy = status === "connecting" || status === "reconnecting" || !!isSearching;

  const headline = () => {
    if (!isOnline) {
      return "No network";
    }
    switch (status) {
      case "registered":
        return deviceName ? `Registered as ${deviceName}` : "Registered";
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting…";
      case "reconnecting":
        return reconnectAttempt
          ? `Reconnecting (${reconnectAttempt}/${WS_CONFIG.RECONNECT.MAX_ATTEMPTS})`
          : "Reconnecting…";
      case "error":
        return "Not connected";
      default:
        return isSearching ? "Looking for an agent" : "Disconnected";
    }
  };

  const detail = () => {
    if (!isOnline) {
      return "Join the network the agent is on";
    }
    if (status === "error" && error) {
      return error;
    }
    if (serverUrl && status !== "disconnected") {
      return serverUrl;
    }
    if (isSearching) {
      return "Searching the local network…";
    }
    return "Tap to choose an agent";
  };

  const detailText = detail();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.75}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`Connection: ${headline()}`}
    >
      {busy && isOnline ? (
        <ActivityIndicator size="small" color={color} style={styles.marker} />
      ) : (
        <View style={[styles.marker, styles.dot, { backgroundColor: isOnline ? color : colors.danger }]} />
      )}

      <View style={styles.text}>
        <Text style={styles.headline}>{headline()}</Text>
        {detailText ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detailText}
          </Text>
        ) : null}
      </View>

      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try connecting again"
          hitSlop={12}
        >
          <Text style={styles.retry}>Try again</Text>
        </TouchableOpacity>
      ) : onPress ? (
        <Text style={styles.chevron}>›</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  marker: {
    width: 12,
    height: 12,
    marginRight: spacing.md,
  },
  dot: {
    borderRadius: 6,
  },
  text: {
    flex: 1,
  },
  headline: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  detail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  retry: {
    ...typography.label,
    color: colors.link,
    fontWeight: "700",
    marginLeft: spacing.sm,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.textFaint,
    marginLeft: spacing.sm,
  },
});
