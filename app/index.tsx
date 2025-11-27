import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useConnection, useNFC } from "@/hooks";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { ScanButton } from "@/components/ScanButton";
import { TagCard } from "@/components/TagCard";

export default function ScannerScreen() {
  const router = useRouter();
  const { status, serverUrl, isRegistered } = useConnection();
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
      </View>

      <ConnectionStatus status={status} serverUrl={serverUrl} />

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
            Scanning paused - NFC still captured
          </Text>
        )}
        {!isRegistered && status !== "disconnected" && (
          <Text style={styles.warningText}>
            Not registered - tags will be saved locally
          </Text>
        )}
      </View>

      {lastTag && (
        <View style={styles.tagSection}>
          <TagCard tag={lastTag} />
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearLastTag}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.footerButton}
          onPress={() => router.push("/(modals)/server-list")}
        >
          <Text style={styles.footerButtonText}>Find Servers</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.footerButton}
          onPress={() => router.push("/settings")}
        >
          <Text style={styles.footerButtonText}>Settings</Text>
        </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1F2937",
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
  },
  scanContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  activeText: {
    marginTop: 16,
    fontSize: 14,
    color: "#10B981",
    fontWeight: "500",
  },
  pausedText: {
    marginTop: 16,
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  warningText: {
    marginTop: 8,
    fontSize: 12,
    color: "#F59E0B",
  },
  tagSection: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  clearButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    alignSelf: "center",
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  footerButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
});
