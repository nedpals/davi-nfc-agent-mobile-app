import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Notice } from "@/components/Notice";
import { ScanButton } from "@/components/ScanButton";
import { TagDrawer } from "@/components/TagDrawer";
import { colors, radius, shadows, spacing, typography } from "@/constants/theme";
import { useAutoConnect, useConnection, useNFC, usePairing } from "@/hooks";

// Keeps the scan button clear of the tag drawer that floats over the bottom.
const DRAWER_CLEARANCE = 96;

export default function ScannerScreen() {
  const router = useRouter();
  const { status, serverUrl, deviceName, isRegistered, error, reconnectAttempt } = useConnection();
  const { isSearching, isOnline } = useAutoConnect();
  // Reads the stored credential once at start, so pairing and pin enforcement
  // are known before anything is dialled.
  usePairing();

  const {
    isSupported,
    isEnabled,
    isActive,
    processingEnabled,
    lastTag,
    scanHistory,
    toggleProcessing,
    clearLastTag,
    initError,
    openSystemSettings,
    canOpenSystemSettings,
  } = useNFC();

  const nfcUnsupported = isSupported === false;
  const nfcOff = isSupported === true && isEnabled === false;
  const readerStalled = isSupported === true && isEnabled === true && !isActive;
  const canScan = !nfcUnsupported && !nfcOff && isActive;

  const disabledReason = nfcUnsupported
    ? "This device has no NFC reader"
    : nfcOff
      ? "Turn on NFC to scan"
      : "Starting the reader…";

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
            accessibilityLabel="Scan history"
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
      />

      <View style={styles.notices}>
        {initError && <Notice tone="danger" message={initError} />}

        {nfcUnsupported && (
          <Notice
            tone="danger"
            message="This device has no NFC reader, so it cannot scan tags."
          />
        )}

        {nfcOff && (
          <Notice
            tone="warning"
            message="NFC is switched off in system settings."
            actionLabel={canOpenSystemSettings ? "Open settings" : undefined}
            onAction={canOpenSystemSettings ? openSystemSettings : undefined}
          />
        )}

        {!nfcUnsupported && !nfcOff && readerStalled && !initError && (
          <Notice tone="muted" message="Starting the NFC reader…" />
        )}

        {canScan && !isRegistered && status !== "disconnected" && (
          <Notice tone="warning" message="Not registered yet — scans are kept on this device." />
        )}
      </View>

      <View style={styles.scanArea}>
        <ScanButton
          onPress={toggleProcessing}
          processingEnabled={processingEnabled}
          disabled={!canScan}
          disabledReason={disabledReason}
        />

        {canScan && processingEnabled && (
          <Text style={styles.prompt}>Hold a tag against the back of the phone</Text>
        )}
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
    paddingBottom: DRAWER_CLEARANCE,
  },
  prompt: {
    marginTop: spacing.lg,
    ...typography.caption,
    color: colors.textMuted,
  },
});
