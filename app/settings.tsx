import { useEffect, useState } from "react";
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
import { hostFromAgentUrl } from "@/services/agent-url";
import { clearCredential, loadCredential, saveCredential } from "@/services/credentials";
import { pairWithAgent } from "@/services/pairing";
import { useAppStore } from "@/stores";
import type { AgentCredential } from "@/types/protocol";

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
  const setApiSecret = useAppStore((state) => state.setApiSecret);
  const device = useAppStore((state) => state.device);
  const apiSecret = useAppStore((state) => state.connection.apiSecret);

  const [urlInput, setUrlInput] = useState(serverUrl || "");
  const [nameInput, setNameInput] = useState(deviceName);
  const [secretInput, setSecretInput] = useState(apiSecret || "");
  const [pinInput, setPinInput] = useState("");
  const [credential, setCredential] = useState<AgentCredential | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const setPaired = useAppStore((state) => state.setPaired);
  const pinningState = useAppStore((state) => state.connection.pinningState);

  useEffect(() => {
    loadCredential().then((stored) => {
      setCredential(stored);
      setPaired(stored !== null);
    });
  }, [setPaired]);

  const handlePair = async () => {
    const host = hostFromAgentUrl(urlInput);
    if (!host) {
      Alert.alert("Enter the agent's address first", "Pairing needs to know which agent to ask.");
      return;
    }
    if (!pinInput.trim()) {
      Alert.alert("Enter the PIN", "The agent shows a six-digit PIN in its tray menu and logs.");
      return;
    }

    setIsPairing(true);
    try {
      const paired = await pairWithAgent(host, pinInput.trim(), nameInput.trim() || deviceName);
      await saveCredential(paired);
      setCredential(paired);
      setPaired(true);
      setPinInput("");
      Alert.alert(
        "Paired",
        paired.publicKeyPin
          ? "This device has its own credential and knows the agent's key."
          : "This device has its own credential. The agent is serving without TLS.",
      );
    } catch (error) {
      Alert.alert("Pairing failed", error instanceof Error ? error.message : String(error));
    } finally {
      setIsPairing(false);
    }
  };

  const handleUnpair = async () => {
    await clearCredential();
    setCredential(null);
    setPaired(false);
    Alert.alert(
      "Unpaired",
      "The credential was removed from this device. Revoke it from the agent's tray as well if it should stop working there.",
    );
  };

  const handleConnect = async () => {
    if (!urlInput.trim()) {
      Alert.alert("Invalid URL", "Please enter a server URL");
      return;
    }

    // Commit the secret before dialling, since the connection reads it from
    // the store rather than from this screen.
    setApiSecret(secretInput.trim() || null);

    setIsConnecting(true);
    try {
      await connect(urlInput.trim());
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
              placeholder="192.168.1.100:9470"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.hint}>
              Connects over wss://. Prefix with ws:// for an agent started with
              -auto-tls=false.
            </Text>

            <TextInput
              style={[styles.input, styles.stackedInput]}
              value={secretInput}
              onChangeText={setSecretInput}
              placeholder="Shared API secret (only if not paired)"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={styles.hint}>
              Pairing below replaces this. The shared secret still works, but
              rotating it logs out every device at once.
            </Text>

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

          {/* Pairing Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pairing</Text>

            {credential ? (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Paired with</Text>
                  <Text style={styles.infoValue}>{credential.host}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Device ID</Text>
                  <Text style={styles.infoValue}>{credential.deviceID}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Agent key pin</Text>
                  <Text style={styles.infoValue}>
                    {credential.publicKeyPin || "None — agent serves no TLS"}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Pin enforced</Text>
                  <Text style={styles.infoValue}>
                    {pinningState === "pinned"
                      ? "Yes"
                      : pinningState === "unavailable"
                        ? "No — this build cannot verify it"
                        : "Not applicable"}
                  </Text>
                </View>
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.disconnectButton]}
                    onPress={handleUnpair}
                  >
                    <Text style={styles.disconnectButtonText}>Unpair</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  value={pinInput}
                  onChangeText={setPinInput}
                  placeholder="Six-digit PIN"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Text style={styles.hint}>
                  The agent shows the PIN in its tray menu, its logs, and its
                  pairing page. Five wrong attempts lock pairing until it
                  restarts.
                </Text>
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.connectButton]}
                    onPress={handlePair}
                    disabled={isPairing}
                  >
                    <Text style={styles.connectButtonText}>
                      {isPairing ? "Pairing..." : "Pair with agent"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.hint}>
                  Pairing gives this device its own credential, revocable on its
                  own from the agent&apos;s tray.
                </Text>
              </>
            )}
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
  stackedInput: {
    marginTop: 12,
  },
  hint: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
    lineHeight: 16,
  },
  buttonRow: {
    marginTop: 12,
    gap: 8,
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
  secondaryButton: {
    backgroundColor: "#F3F4F6",
  },
  secondaryButtonText: {
    color: "#374151",
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
