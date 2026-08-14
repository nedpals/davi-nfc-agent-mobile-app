import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const surface: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.surfaceMuted },
  danger: { backgroundColor: colors.dangerSoft },
};

const label: Record<Variant, string> = {
  primary: colors.textInverse,
  secondary: colors.text,
  danger: colors.dangerText,
};

export function Button({
  label: text,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: ButtonProps) {
  const isInactive = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isInactive}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isInactive, busy: !!loading }}
      style={[styles.button, surface[variant], isInactive && styles.inactive, style]}
    >
      <View style={styles.content}>
        {loading && <ActivityIndicator size="small" color={label[variant]} />}
        <Text style={[styles.label, { color: label[variant] }]}>{text}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  inactive: {
    opacity: 0.55,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
  },
});
