import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from "react-native";

interface ScanButtonProps {
  onPress: () => void;
  isScanning: boolean;
  disabled?: boolean;
}

export function ScanButton({ onPress, isScanning, disabled }: ScanButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        isScanning && styles.buttonScanning,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || isScanning}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        {isScanning ? (
          <>
            <ActivityIndicator color="#FFFFFF" size="large" />
            <Text style={styles.text}>Scanning...</Text>
            <Text style={styles.subText}>Hold device near NFC tag</Text>
          </>
        ) : (
          <>
            <Text style={styles.icon}>📡</Text>
            <Text style={styles.text}>Scan NFC Tag</Text>
            <Text style={styles.subText}>Tap to start scanning</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#3B82F6",
    borderRadius: 100,
    width: 200,
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonScanning: {
    backgroundColor: "#F59E0B",
    shadowColor: "#F59E0B",
  },
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
    shadowColor: "#9CA3AF",
  },
  content: {
    alignItems: "center",
  },
  icon: {
    fontSize: 48,
    marginBottom: 8,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  subText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
    marginTop: 4,
  },
});
