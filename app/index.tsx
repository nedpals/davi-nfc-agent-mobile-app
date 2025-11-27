import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useConnection, useNFC, useAutoConnect } from "@/hooks";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { ScanButton } from "@/components/ScanButton";
import { TagDrawer } from "@/components/TagDrawer";

export default function ScannerScreen() {
  const router = useRouter();
  const { status, serverUrl, deviceName, isRegistered } = useConnection();
  const { isSearching } = useAutoConnect();
  const {
    isSupported,
    isEnabled,
    isActive,
    processingEnabled,
    lastTag,
    toggleProcessing,
    clearLastTag,
    initError
  } = useNFC();

  const handleToggleProcessing = () => {
    if (!isSupported) {
      Alert.alert("NFC Not Supported", "This device does not support NFC.");
      return;
    }

    if (!isEnabled) {
      Alert.alert(
        "NFC Disabled",
        "Please enable NFC in your device settings to scan tags."
      );
      return;
    }

    toggleProcessing();
  };

  const canToggle = isSupported && isEnabled && isActive;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>DAVI NFC Scanner</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push("/settings")}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      <ConnectionStatus
        status={status}
        serverUrl={serverUrl}
        deviceName={deviceName}
        isSearching={isSearching}
        onPress={() => router.push("/(modals)/server-list")}
      />

      {initError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{initError}</Text>
        </View>
      )}

      <View style={styles.scanContainer}>
        <ScanButton
          onPress={handleToggleProcessing}
          processingEnabled={processingEnabled}
          disabled={!canToggle}
        />
        {isActive && processingEnabled && (
          <Text style={styles.activeText}>
            Hold device near NFC tag
          </Text>
        )}
        {isActive && !processingEnabled && (
          <Text style={styles.pausedText}>
            Scanning paused
          </Text>
        )}
        {!isRegistered && status !== "disconnected" && (
          <Text style={styles.warningText}>
            Not registered - tags saved locally
          </Text>
        )}
      </View>

      <TagDrawer tag={lastTag} onClear={clearLastTag} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFB",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F4E5F",
    letterSpacing: 0.5,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  settingsIcon: {
    fontSize: 20,
    color: "#1F4E5F",
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
  },
  scanContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 20,
  },
  activeText: {
    marginTop: 24,
    fontSize: 15,
    color: "#00A4E4",
    fontWeight: "500",
  },
  pausedText: {
    marginTop: 24,
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "500",
  },
  warningText: {
    marginTop: 8,
    fontSize: 12,
    color: "#F59E0B",
  },
});
