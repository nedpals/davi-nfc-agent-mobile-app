import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
} from "react-native";

interface ScanButtonProps {
  onPress: () => void;
  processingEnabled: boolean;
  tagPresent: boolean;
  disabled?: boolean;
}

export function ScanButton({ onPress, processingEnabled, tagPresent, disabled }: ScanButtonProps) {
  const getButtonStyle = () => {
    if (disabled) return styles.buttonDisabled;
    if (tagPresent && processingEnabled) return styles.buttonTagPresent;
    if (processingEnabled) return styles.buttonActive;
    return styles.buttonInactive;
  };

  const getStatusText = () => {
    if (!processingEnabled) return "Paused";
    if (tagPresent) return "Tag Detected";
    return "Ready";
  };

  const getSubText = () => {
    if (!processingEnabled) return "Tap to resume scanning";
    return "Tap to pause scanning";
  };

  const getIcon = () => {
    if (tagPresent && processingEnabled) return "✓";
    if (processingEnabled) return "📡";
    return "⏸";
  };

  return (
    <TouchableOpacity
      style={[styles.button, getButtonStyle()]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>{getIcon()}</Text>
        <Text style={styles.text}>{getStatusText()}</Text>
        <Text style={styles.subText}>{getSubText()}</Text>
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
  buttonActive: {
    backgroundColor: "#10B981",
    shadowColor: "#10B981",
  },
  buttonInactive: {
    backgroundColor: "#6B7280",
    shadowColor: "#6B7280",
  },
  buttonTagPresent: {
    backgroundColor: "#3B82F6",
    shadowColor: "#3B82F6",
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
