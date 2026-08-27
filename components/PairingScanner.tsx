import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Notice } from "@/components/Notice";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { PairingUriError, parsePairingUri, type PairingInvitation } from "@/services/pairing-uri";

interface Props {
  onScanned: (invitation: PairingInvitation) => void;
  onCancel: () => void;
}

/**
 * Reads the agent's pairing QR.
 *
 * The QR is what carries the agent's key pin, which is the one value a device
 * cannot obtain safely over the network — so this is the path that produces a
 * verified pairing, and the typed PIN below it is the fallback.
 */
export function PairingScanner({ onScanned, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  // The camera fires for every frame a code is visible in, which for a QR held
  // steady is many. One accepted scan ends the screen, so the rest are ignored.
  const handled = useRef(false);

  const handleScan = (value: string) => {
    if (handled.current) {
      return;
    }

    try {
      const invitation = parsePairingUri(value);
      handled.current = true;
      onScanned(invitation);
    } catch (failure) {
      // Not latched: a QR that is not a pairing link may simply be the wrong
      // one in frame, and the next one should still be read.
      setError(
        failure instanceof PairingUriError ? failure.message : "That QR could not be read."
      );
    }
  };

  if (!permission) {
    return <View style={styles.frame} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.body}>
        <Notice
          tone="info"
          message={
            permission.canAskAgain
              ? "The camera reads the pairing QR the agent shows on its screen."
              : "Camera access is off for this app. Turn it on in Settings, or type the PIN below."
          }
        />
        {permission.canAskAgain ? (
          <Button label="Allow camera" onPress={() => requestPermission()} />
        ) : null}
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <View style={styles.frame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => handleScan(data)}
        />
      </View>

      {error ? <Notice tone="danger" message={error} /> : null}

      <Text style={styles.hint}>
        Point the camera at the QR the agent prints at startup, beside its PIN.
      </Text>

      <Button label="Cancel" variant="secondary" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  frame: {
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
});
