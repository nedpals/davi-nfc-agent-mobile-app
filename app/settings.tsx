import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { InfoRow, InfoRows, Section } from "@/components/Section";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { useConnection, usePairing } from "@/hooks";
import { hostFromAgentUrl } from "@/services/agent-url";
import { useAppStore } from "@/stores";
import { describeCapabilities } from "@/utils/capabilities";
import { connectionLabel } from "@/utils/connection";
import { formatDateTime, truncateMiddle } from "@/utils/format";

const pinningLabel = {
  pinned: { text: "Enforced", tone: "success" },
  unavailable: { text: "This build cannot verify it", tone: "danger" },
  downgraded: { text: "Cleartext — pin cannot apply", tone: "danger" },
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

  const { pairing, isPaired, pinningState, unpair } = usePairing();

  const setDeviceName = useAppStore((state) => state.setDeviceName);
  const setApiSecret = useAppStore((state) => state.setApiSecret);
  const device = useAppStore((state) => state.device);
  const apiSecret = useAppStore((state) => state.connection.apiSecret);

  const [urlInput, setUrlInput] = useState(serverUrl ?? "");
  const [nameInput, setNameInput] = useState(deviceName);
  const [secretInput, setSecretInput] = useState(apiSecret ?? "");
  const [isConnecting, setIsConnecting] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const urlEdited = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimer.current) {
      clearTimeout(savedTimer.current);
    }
  }, []);

  // Discovery can settle on an address while this screen is open, and showing
  // the stale one would have the user connect somewhere else entirely.
  useEffect(() => {
    if (!urlEdited.current) {
      setUrlInput(serverUrl ?? "");
    }
  }, [serverUrl]);

  // Renaming is a small edit, and a modal alert to confirm one is a bigger
  // interruption than the change deserves.
  const handleSaveName = useCallback(() => {
    setDeviceName(nameInput.trim());
    setNameSaved(true);

    if (savedTimer.current) {
      clearTimeout(savedTimer.current);
    }
    savedTimer.current = setTimeout(() => setNameSaved(false), 2000);
  }, [nameInput, setDeviceName]);

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

  // Pairing itself lives on its own screen, reached from here and from tapping
  // an agent to connect to. The address field is what this screen knows about
  // the agent, so it is what gets handed over.
  const handlePair = () => {
    const host = hostFromAgentUrl(urlInput);
    if (!host) {
      Alert.alert("Address required", "Pairing needs to know which agent to ask.");
      return;
    }

    router.push({ pathname: "/(modals)/pair", params: { host, url: urlInput.trim() } });
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
  // Nothing to save until the name is both different and usable.
  const nameChanged = nameInput.trim().length > 0 && nameInput.trim() !== deviceName;

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
          <Ionicons name="chevron-back" size={22} color={colors.link} />
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
          <Section
            title="Device name"
            footer={
              nameSaved
                ? "Saved — the agent sees it the next time this device registers."
                : "Shown by the agent to identify this reader."
            }
          >
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                value={nameInput}
                onChangeText={(value) => {
                  setNameInput(value);
                  setNameSaved(false);
                }}
                placeholder="Kiosk phone"
                placeholderTextColor={colors.textFaint}
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
              />
              <Button
                label="Save"
                onPress={handleSaveName}
                disabled={!nameChanged}
                style={styles.inlineButton}
              />
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
              <InfoRows>
                <InfoRow label="Agent" value={pairing.host} />
                <InfoRow label="Device ID" value={truncateMiddle(pairing.deviceID)} mono />
                <InfoRow
                  label="Agent key pin"
                  value={
                    pairing.publicKeyPin ? truncateMiddle(pairing.publicKeyPin, 10) : "None — no TLS"
                  }
                  mono
                />
                <InfoRow label="Pin" value={pinning.text} tone={pinning.tone} />
              </InfoRows>
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
              footer="Pairing hands this device its own credential and the key to recognize the agent by, which is what lets it connect over the agent's own certificate."
            >
              <Button label="Pair with agent" onPress={handlePair} />
            </Section>
          )}

          <Section title="This device">
            <InfoRows>
              <InfoRow label="Registered ID" value={deviceId ?? "Not registered"} mono />
              <InfoRow label="Platform" value={device.platform === "ios" ? "iOS" : "Android"} />
              <InfoRow label="App version" value={device.appVersion} />
              <InfoRow label="Status" value={connectionLabel(status)} />
              <InfoRow label="Last connected" value={formatDateTime(lastConnected)} />
            </InfoRows>
          </Section>

          <Section
            title="What this device offers"
            footer="Sent to the agent when this device registers, so it knows what work to route here. Writing, locking and raw exchange need a tag held in the field, which CoreNFC cannot offer."
          >
            <InfoRows>
              {describeCapabilities().map((capability) => (
                <InfoRow
                  key={capability.label}
                  label={capability.label}
                  value={capability.value}
                  tone={capability.offered ? "default" : "muted"}
                />
              ))}
            </InfoRows>
          </Section>

          {serverInfo && (
            <Section title="Agent details">
              <InfoRows>
                <InfoRow label="Version" value={serverInfo.version} />
                <InfoRow label="Protocol" value={`v${protocolVersion}`} />
                <InfoRow label="Supported NFC" value={serverInfo.supportedNFC.join(", ") || "—"} />
              </InfoRows>
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
