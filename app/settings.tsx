import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { InfoRow, Section } from "@/components/Section";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { useConnection, usePairing } from "@/hooks";
import { hostFromAgentUrl } from "@/services/agent-url";
import { useAppStore } from "@/stores";
import { formatDateTime, truncateMiddle } from "@/utils/format";

const pinningLabel = {
  pinned: { text: "Enforced", tone: "success" },
  unavailable: { text: "This build cannot verify it", tone: "danger" },
  "not-applicable": { text: "No key held", tone: "muted" },
} as const;

export default function SettingsScreen() {
  const router = useRouter();
  const {
    status,
    serverUrl,
    deviceId,
    deviceName,
    serverInfo,
    lastConnected,
    protocolVersion,
    connect,
    disconnect,
    isConnected,
    isBusy,
  } = useConnection();

  const { pairing, isPaired, pinningState, isPairing, pair, unpair } = usePairing();

  const setDeviceName = useAppStore((state) => state.setDeviceName);
  const setApiSecret = useAppStore((state) => state.setApiSecret);
  const device = useAppStore((state) => state.device);
  const apiSecret = useAppStore((state) => state.connection.apiSecret);

  const [urlInput, setUrlInput] = useState(serverUrl ?? "");
  const [nameInput, setNameInput] = useState(deviceName);
  const [secretInput, setSecretInput] = useState(apiSecret ?? "");
  const [pinInput, setPinInput] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const urlEdited = useRef(false);

  // Discovery can settle on an address while this screen is open, and showing
  // the stale one would have the user connect somewhere else entirely.
  useEffect(() => {
    if (!urlEdited.current) {
      setUrlInput(serverUrl ?? "");
    }
  }, [serverUrl]);

  const handleSaveName = () => {
    const name = nameInput.trim();
    if (!name) {
      Alert.alert("Name required", "Give this device a name the agent can show.");
      return;
    }

    setDeviceName(name);
    Alert.alert("Saved", "The new name is sent the next time this device registers.");
  };

  const handleConnect = async () => {
    const url = urlInput.trim();
    if (!url) {
      Alert.alert("Address required", "Enter the agent's address, such as 192.168.1.100:9470.");
      return;
    }

    // Committed before dialling, since the connection reads the secret from the
    // store rather than from this screen.
    setApiSecret(secretInput.trim() || null);
    setIsConnecting(true);

    try {
      await connect(url);
      urlEdited.current = false;
    } catch (error) {
      Alert.alert(
        "Could not connect",
        error instanceof Error ? error.message : "The agent did not answer."
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePair = async () => {
    const host = hostFromAgentUrl(urlInput);
    if (!host) {
      Alert.alert("Address required", "Pairing needs to know which agent to ask.");
      return;
    }
    if (!pinInput.trim()) {
      Alert.alert("PIN required", "The agent shows a six-digit PIN in its tray menu and logs.");
      return;
    }

    try {
      const credential = await pair(host, pinInput.trim(), nameInput.trim() || deviceName);
      setPinInput("");
      Alert.alert(
        "Paired",
        credential.publicKeyPin
          ? "This device has its own credential and knows the agent's key."
          : "This device has its own credential. The agent is serving without TLS."
      );
    } catch (error) {
      Alert.alert("Pairing failed", error instanceof Error ? error.message : String(error));
    }
  };

  const handleUnpair = () => {
    Alert.alert("Remove this device's credential?", "It will fall back to the shared API secret.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unpair",
        style: "destructive",
        onPress: () => {
          unpair()
            .then(() =>
              Alert.alert(
                "Unpaired",
                "Revoke it from the agent's tray as well if it should stop working there."
              )
            )
            .catch((error) => Alert.alert("Could not unpair", String(error)));
        },
      },
    ]);
  };

  const pinning = pinningLabel[pinningState];

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.brand} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Section title="Device name" footer="Shown by the agent to identify this reader.">
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Kiosk phone"
                placeholderTextColor={colors.textFaint}
              />
              <Button label="Save" onPress={handleSaveName} style={styles.inlineButton} />
            </View>
          </Section>

          <Section
            title="Agent"
            footer="Connects over wss://. Prefix with ws:// for an agent started with -auto-tls=false."
          >
            <TextInput
              style={styles.input}
              value={urlInput}
              onChangeText={(value) => {
                urlEdited.current = true;
                setUrlInput(value);
              }}
              placeholder="192.168.1.100:9470"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            {!isPaired && (
              <TextInput
                style={[styles.input, styles.stacked]}
                value={secretInput}
                onChangeText={setSecretInput}
                placeholder="Shared API secret"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
            )}

            {isConnected ? (
              <Button
                label="Disconnect"
                variant="danger"
                onPress={disconnect}
                style={styles.stacked}
              />
            ) : (
              <Button
                label={isConnecting || isBusy ? "Connecting…" : "Connect"}
                onPress={handleConnect}
                loading={isConnecting || isBusy}
                style={styles.stacked}
              />
            )}
          </Section>

          {isPaired && pairing ? (
            <Section
              title="Pairing"
              footer="Each device's credential is revoked on its own from the agent's tray."
            >
              <InfoRow label="Agent" value={pairing.host} />
              <InfoRow label="Device ID" value={truncateMiddle(pairing.deviceID)} mono />
              <InfoRow
                label="Agent key pin"
                value={pairing.publicKeyPin ? truncateMiddle(pairing.publicKeyPin, 10) : "None — no TLS"}
                mono
              />
              <InfoRow label="Pin" value={pinning.text} tone={pinning.tone} last />
              <Button
                label="Unpair"
                variant="danger"
                onPress={handleUnpair}
                style={styles.stacked}
              />
            </Section>
          ) : (
            <Section
              title="Pairing"
              footer="The agent shows the PIN in its tray menu, its logs and its pairing page. Five wrong attempts lock pairing until it restarts."
            >
              <TextInput
                style={styles.input}
                value={pinInput}
                onChangeText={setPinInput}
                placeholder="Six-digit PIN"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Button
                label={isPairing ? "Pairing…" : "Pair with agent"}
                onPress={handlePair}
                loading={isPairing}
                style={styles.stacked}
              />
            </Section>
          )}

          <Section title="This device">
            <InfoRow label="Registered ID" value={deviceId ?? "Not registered"} mono />
            <InfoRow label="Platform" value={device.platform === "ios" ? "iOS" : "Android"} />
            <InfoRow label="App version" value={device.appVersion} />
            <InfoRow label="Status" value={status} />
            <InfoRow label="Last connected" value={formatDateTime(lastConnected)} last />
          </Section>

          {serverInfo && (
            <Section title="Agent details">
              <InfoRow label="Version" value={serverInfo.version} />
              <InfoRow label="Protocol" value={`v${protocolVersion}`} />
              <InfoRow
                label="Supported NFC"
                value={serverInfo.supportedNFC.join(", ") || "—"}
                last
              />
            </Section>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  back: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.sm,
  },
  title: {
    ...typography.screenTitle,
    color: colors.text,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  inlineButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  stacked: {
    marginTop: spacing.md,
  },
});
