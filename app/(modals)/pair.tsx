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
import { Section } from "@/components/Section";
import { colors, fontFamily, radius, spacing, typography } from "@/constants/theme";
import { useConnection, usePairing } from "@/hooks";
import { describeConnectionFailure } from "@/services/connection-errors";
import { formatHost } from "@/services/agent-url";

const PIN_LENGTH = 6;

/**
 * Pairing, reached by tapping the agent to connect to.
 *
 * It is a step of connecting rather than a setting: the address comes from
 * whatever named the agent — a discovery record, a typed address — so the only
 * thing left to ask for is the PIN, and the connection is dialled here once
 * there is a credential to dial it with.
 */
export default function PairScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    host?: string;
    port?: string;
    name?: string;
    url?: string;
  }>();

  const { connect, deviceName } = useConnection();
  const { pair, isPairing } = usePairing();

  const [pin, setPin] = useState("");
  const [name, setName] = useState(deviceName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const host = params.host ?? "";
  const port = params.port ?? "";
  const target = params.url || `${formatHost(host)}${port ? `:${port}` : ""}`;
  const address = port ? `${formatHost(host)}:${port}` : formatHost(host);

  // The modal is one of several stacked over the scanner, and finishing here
  // means the whole detour is over rather than one screen of it.
  const finish = () => router.dismissAll();

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
      await pair(host, pin.trim(), name.trim() || deviceName);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }

    setPin("");
    await dial();
  };

  const busy = isPairing || isConnecting;

  if (!host) {
    return (
      <SafeAreaView style={styles.screen}>
        <ModalHeader title="Pair with agent" onClose={finish} />
        <View style={styles.body}>
          <Notice tone="danger" message="No agent address was given to pair with." />
        </View>
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
          <View style={styles.identity}>
            <Text style={styles.agentName} numberOfLines={1}>
              {params.name || "Agent"}
            </Text>
            <Text style={styles.agentAddress} numberOfLines={1}>
              {address}
            </Text>
          </View>

          {error ? <Notice tone="danger" message={error} /> : null}

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
              autoFocus
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
            disabled={pin.length !== PIN_LENGTH}
          />

          {/* An agent started without TLS and without a secret needs no
              credential, and demanding a PIN it never printed would leave that
              setup with no way in. */}
          <Button
            label="Connect without pairing"
            variant="secondary"
            onPress={dial}
            disabled={busy}
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
  stacked: {
    marginTop: spacing.sm,
  },
});
