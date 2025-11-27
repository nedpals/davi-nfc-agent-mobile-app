import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useConnection } from "@/hooks";
import { useAppStore } from "@/stores";

export default function SettingsScreen() {
  const router = useRouter();
  const {
    status,
    serverUrl,
    deviceId,
    deviceName,
    serverInfo,
    lastConnected,
    connect,
    disconnect,
    isConnected,
  } = useConnection();

  const setDeviceName = useAppStore((state) => state.setDeviceName);
  const device = useAppStore((state) => state.device);

  const [urlInput, setUrlInput] = useState(serverUrl || "");
  const [nameInput, setNameInput] = useState(deviceName);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!urlInput.trim()) {
      Alert.alert("Invalid URL", "Please enter a server URL");
      return;
    }

    let url = urlInput.trim();
    // Add ws:// prefix if missing
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      url = `ws://${url}`;
    }
    // Add /ws path if missing
    if (!url.includes("/ws")) {
      url = `${url}/ws`;
    }

    setIsConnecting(true);
    try {
      await connect(url);
      Alert.alert("Connected", "Successfully connected to server");
    } catch (error) {
      Alert.alert(
        "Connection Failed",
        error instanceof Error ? error.message : "Failed to connect"
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const handleSaveName = () => {
    if (nameInput.trim()) {
      setDeviceName(nameInput.trim());
      Alert.alert("Saved", "Device name updated");
    }
  };

  const formatDate = (date: Date | null | string): string => {
    if (!date) return "Never";
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Settings</Text>
          </View>

          {/* Device Name Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Device Name</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Enter device name"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveName}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Server Connection Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Server Connection</Text>
            <TextInput
              style={styles.input}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="ws://192.168.1.100:8080/ws"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={styles.buttonRow}>
              {isConnected ? (
                <TouchableOpacity
                  style={[styles.button, styles.disconnectButton]}
                  onPress={handleDisconnect}
                >
                  <Text style={styles.disconnectButtonText}>Disconnect</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.button, styles.connectButton]}
                  onPress={handleConnect}
                  disabled={isConnecting}
                >
                  <Text style={styles.connectButtonText}>
                    {isConnecting ? "Connecting..." : "Connect"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Device Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Device Info</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Device ID</Text>
              <Text style={styles.infoValue}>{deviceId || "Not registered"}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Platform</Text>
              <Text style={styles.infoValue}>
                {device.platform === "ios" ? "iOS" : "Android"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>App Version</Text>
              <Text style={styles.infoValue}>{device.appVersion}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Connection Status</Text>
              <Text style={styles.infoValue}>{status}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Last Connected</Text>
              <Text style={styles.infoValue}>{formatDate(lastConnected)}</Text>
            </View>
          </View>

          {/* Server Info Section (when connected) */}
          {serverInfo && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Server Info</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Version</Text>
                <Text style={styles.infoValue}>{serverInfo.version}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Supported NFC</Text>
                <Text style={styles.infoValue}>
                  {serverInfo.supportedNFC.join(", ")}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    fontSize: 16,
    color: "#3B82F6",
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1F2937",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#1F2937",
  },
  saveButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  buttonRow: {
    marginTop: 12,
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  connectButton: {
    backgroundColor: "#3B82F6",
  },
  connectButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  disconnectButton: {
    backgroundColor: "#FEE2E2",
  },
  disconnectButtonText: {
    color: "#DC2626",
    fontWeight: "600",
    fontSize: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  infoValue: {
    fontSize: 14,
    color: "#1F2937",
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
});
