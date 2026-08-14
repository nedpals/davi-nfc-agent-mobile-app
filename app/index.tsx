import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Notice } from "@/components/Notice";
import { ScanButton } from "@/components/ScanButton";
import { TAG_DRAWER_HEIGHT, TagDrawer } from "@/components/TagDrawer";
import { colors, radius, shadows, spacing, typography } from "@/constants/theme";
import { useAutoConnect, useConnection, useNFC, usePairing } from "@/hooks";

/**
 * What the reader is doing, as one answer rather than four overlapping
 * booleans. Everything the screen says about NFC is keyed off this.
 */
type ReaderState = "unsupported" | "off" | "failed" | "starting" | "stalled" | "ready";

const READER_HINT: Record<ReaderState, string> = {
  unsupported: "This device has no NFC reader",
  off: "Turn on NFC to scan",
  failed: "The reader could not be started",
  starting: "Starting the reader…",
  stalled: "The reader is not running",
  ready: "",
};

export default function ScannerScreen() {
  const router = useRouter();
  const {
    status,
    serverUrl,
    deviceName,
    isRegistered,
    error,
    reconnectAttempt,
    retry: retryConnection,
  } = useConnection();
  const { isSearching, isOnline, retry: retryDiscovery } = useAutoConnect();
  // Reads the stored credential once at start, so pairing and pin enforcement
  // are known before anything is dialled.
  usePairing();

  const {
    isSupported,
    isEnabled,
    isActive,
    isInitialized,
    processingEnabled,
    lastTag,
    scanHistory,
    toggleProcessing,
    clearLastTag,
    initError,
    openSystemSettings,
    canOpenSystemSettings,
  } = useNFC();

  const readerState: ReaderState = initError
    ? "failed"
    : isSupported === false
      ? "unsupported"
      : isEnabled === false
        ? "off"
        : isActive
          ? "ready"
          : // Before initialisation finishes there is nothing wrong to report;
            // after it, a reader that is still not running is worth saying.
            isInitialized
            ? "stalled"
            : "starting";

  const handleRetry = useCallback(() => {
    // A known address is worth dialling again directly; without one, finding
    // an agent is the only way back.
    if (serverUrl) {
      retryConnection().catch(() => {});
    } else {
      retryDiscovery();
    }
  }, [serverUrl, retryConnection, retryDiscovery]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>DAVI NFC</Text>
          <Text style={styles.subtitle}>Remote tag reader</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push("/(modals)/history")}
            accessibilityRole="button"
            accessibilityLabel={`Scan history, ${scanHistory.length} kept`}
          >
            <Ionicons name="time-outline" size={20} color={colors.brand} />
            {scanHistory.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {scanHistory.length > 99 ? "99+" : scanHistory.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={20} color={colors.brand} />
          </TouchableOpacity>
        </View>
      </View>

      <ConnectionStatus
        status={status}
        serverUrl={serverUrl}
        deviceName={deviceName}
        error={error}
        reconnectAttempt={reconnectAttempt}
        isSearching={isSearching}
        isOnline={isOnline}
        onPress={() => router.push("/(modals)/server-list")}
        onRetry={status === "error" && isOnline ? handleRetry : undefined}
      />

      <View style={styles.notices}>
        {readerState === "failed" && <Notice tone="danger" message={initError!} />}

        {readerState === "unsupported" && (
          <Notice tone="danger" message="This device has no NFC reader, so it cannot scan tags." />
        )}

        {readerState === "off" && (
          <Notice
            tone="warning"
            message="NFC is switched off in system settings."
            actionLabel={canOpenSystemSettings ? "Open settings" : undefined}
            onAction={canOpenSystemSettings ? openSystemSettings : undefined}
          />
        )}

        {readerState === "stalled" && (
          <Notice tone="muted" message="The NFC reader is not running." />
        )}

        {readerState === "ready" && !isRegistered && status !== "disconnected" && (
          <Notice tone="warning" message="Not registered yet — scans are kept on this device." />
        )}
      </View>

      <View style={styles.scanArea}>
        <ScanButton
          onPress={toggleProcessing}
          processingEnabled={processingEnabled}
          disabled={readerState !== "ready"}
          disabledReason={READER_HINT[readerState]}
        />
      </View>

      <TagDrawer
        tag={lastTag}
        onClear={clearLastTag}
        onPress={() => router.push("/(modals)/history")}
      />
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.screenTitle,
    color: colors.brand,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textInverse,
  },
  notices: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  scanArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    // Keeps the button clear of the drawer that floats over the bottom.
    paddingBottom: TAG_DRAWER_HEIGHT + spacing.xxl,
  },
});
