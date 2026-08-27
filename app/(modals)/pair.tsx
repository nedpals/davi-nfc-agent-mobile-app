import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { ModalHeader } from "@/components/ModalHeader";
import { Notice } from "@/components/Notice";
import { PairingScanner } from "@/components/PairingScanner";
import { Section } from "@/components/Section";
import { WS_CONFIG } from "@/constants/config";
import { colors, fontFamily, radius, spacing, typography } from "@/constants/theme";
import { useConnection, usePairing } from "@/hooks";
import { formatHost } from "@/services/agent-url";
import { describeConnectionFailure } from "@/services/connection-errors";
import { PairingUriError, isPairingUri, parsePairingUri } from "@/services/pairing-uri";

const PIN_LENGTH = 6;

/**
 * Pairing, reached by tapping the agent to connect to, or by opening the
 * agent's pairing QR.
 *
 * It is a step of connecting rather than a setting: the address comes from
 * whatever named the agent — a discovery record, a typed address, a pairing
 * link — so the only thing left to ask for is the PIN, and the connection is
 * dialled here once there is a credential to dial it with.
 *
 * The QR carries the agent's key pin, which is what lets this device verify the
 * agent before handing anything to it. Agent 1.2.0 serves pairing over TLS on
 * its own port for that reason, having served it in the clear before. A typed
 * PIN still pairs, but nothing proves what answered, so that pairing is
 * recorded and shown as unverified.
 */
export default function PairScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    host?: string;
    port?: string;
    name?: string;
    url?: string;
    // Set when a davi-pair:// link opened this screen.
    spki?: string;
    code?: string;
  }>();

  const { connect, deviceName } = useConnection();
  const { pair, isPairing } = usePairing();

  const [host, setHost] = useState(params.host ?? "");
  const [port, setPort] = useState(params.port ?? "");
  const [agentName, setAgentName] = useState(params.name ?? "");
  const [keyPin, setKeyPin] = useState<string | null>(params.spki ?? null);
  const [pin, setPin] = useState(params.code ?? "");
  const [name, setName] = useState(deviceName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  const target = params.url || `${formatHost(host)}${port ? `:${port}` : ""}`;
  const address = port ? `${formatHost(host)}:${port}` : formatHost(host);

  // The modal is one of several stacked over the scanner, and finishing here
  // means the whole detour is over rather than one screen of it.
  const finish = () => router.dismissAll();

  const acceptInvitation = (invitation: {
    host: string;
    port: number;
    spki: string;
    code?: string;
    name?: string;
  }) => {
    setHost(invitation.host);
    setPort(String(invitation.port));
    setKeyPin(invitation.spki);
    if (invitation.code) setPin(invitation.code);
    if (invitation.name) setAgentName(invitation.name);
    setError(null);
    setScanning(false);
    setShowPaste(false);
    setPasted("");
  };

  const acceptPasted = () => {
    try {
      acceptInvitation(parsePairingUri(pasted));
    } catch (failure) {
      setError(
        failure instanceof PairingUriError ? failure.message : "That pairing link could not be read."
      );
    }
  };

  const dial = async () => {
    setIsConnecting(true);
    try {
      await connect(target);
      finish();
    } catch (failure) {
      setError(
        describeConnectionFailure(failure instanceof Error ? failure.message : String(failure))
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handlePair = async () => {
    setError(null);

    if (pin.trim().length !== PIN_LENGTH) {
      setError(`The PIN is ${PIN_LENGTH} digits.`);
      return;
    }

    try {
      await pair(host, pin.trim(), name.trim() || deviceName, {
        keyPin,
        port: Number.parseInt(port, 10) || WS_CONFIG.DEFAULT_PORT,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }

    setPin("");
    await dial();
  };

  const busy = isPairing || isConnecting;

  if (scanning) {
    return (
      <SafeAreaView style={styles.screen}>
        <ModalHeader title="Scan pairing QR" onClose={() => setScanning(false)} />
        <ScrollView contentContainerStyle={styles.body}>
          <PairingScanner onScanned={acceptInvitation} onCancel={() => setScanning(false)} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ModalHeader title="Pair with agent" onClose={() => router.back()} />

      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {host ? (
            <View style={styles.identity}>
              <Text style={styles.agentName} numberOfLines={1}>
                {agentName || "Agent"}
              </Text>
              <Text style={styles.agentAddress} numberOfLines={1}>
                {address}
              </Text>
            </View>
          ) : null}

          {error ? <Notice tone="danger" message={error} /> : null}

          {keyPin ? (
            <Notice
              tone="info"
              message="This agent's key came from its pairing code, so the pairing connection can be verified."
            />
          ) : (
            <Notice
              tone="warning"
              message={
                "Without the agent's pairing QR this device cannot verify what answers. Pairing " +
                "still works and the PIN still protects it, but the pairing will be recorded as " +
                "unverified."
              }
            />
          )}

          <Section
            title="Pairing QR"
            footer="The agent prints it at startup, beside its PIN. It carries the key this device recognizes the agent by."
          >
            <Button label="Scan the agent's QR" onPress={() => setScanning(true)} disabled={busy} />
            <Button
              label={showPaste ? "Hide link box" : "Paste a pairing link"}
              variant="secondary"
              onPress={() => setShowPaste((open) => !open)}
              style={styles.stacked}
            />
            {showPaste ? (
              <View style={styles.pasteRow}>
                <TextInput
                  style={styles.input}
                  value={pasted}
                  onChangeText={setPasted}
                  placeholder="davi-pair://…"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  accessibilityLabel="Pairing link"
                />
                <Button
                  label="Use this link"
                  onPress={acceptPasted}
                  disabled={!isPairingUri(pasted)}
                />
              </View>
            ) : null}
          </Section>

          {!host ? (
            <Section title="Agent address" footer="Only needed when no pairing link named one.">
              <TextInput
                style={styles.input}
                value={host}
                onChangeText={setHost}
                placeholder="192.168.1.5"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Agent address"
              />
            </Section>
          ) : null}

          <Section
            title="PIN"
            footer="The agent shows it in its tray menu, its logs and its pairing page. Five wrong attempts lock pairing until the agent restarts."
          >
            <TextInput
              style={styles.pin}
              value={pin}
              onChangeText={(value) => setPin(value.replace(/\D/g, ""))}
              placeholder="000000"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              maxLength={PIN_LENGTH}
              autoFocus={!!host}
              returnKeyType="go"
              onSubmitEditing={handlePair}
              accessibilityLabel="Pairing PIN"
            />
          </Section>

          <Section title="Name this device" footer="How this device is listed on the agent.">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={deviceName}
              placeholderTextColor={colors.textFaint}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </Section>

          <Button
            label={isPairing ? "Pairing…" : isConnecting ? "Connecting…" : "Pair and connect"}
            onPress={handlePair}
            loading={busy}
            disabled={pin.length !== PIN_LENGTH || !host}
          />

          {/* An agent started without TLS and without a secret needs no
              credential, and demanding a PIN it never printed would leave that
              setup with no way in. */}
          <Button
            label="Connect without pairing"
            variant="secondary"
            onPress={dial}
            disabled={busy || !host}
            style={styles.stacked}
          />
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
  fill: {
    flex: 1,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  identity: {
    alignItems: "center",
    gap: 2,
  },
  agentName: {
    ...typography.screenTitle,
    color: colors.text,
  },
  agentAddress: {
    ...typography.caption,
    fontFamily: fontFamily.mono,
    color: colors.textMuted,
  },
  pin: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.mono,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: "center",
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  pasteRow: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  stacked: {
    marginTop: spacing.sm,
  },
});
