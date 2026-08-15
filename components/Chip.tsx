import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

export type ChipTone = "success" | "warning" | "danger" | "muted";

interface ChipProps {
  label: string;
  tone?: ChipTone;
}

const palette: Record<ChipTone, { background: string; text: string }> = {
  success: { background: colors.successSoft, text: colors.successText },
  warning: { background: colors.warningSoft, text: colors.warningText },
  danger: { background: colors.dangerSoft, text: colors.dangerText },
  muted: { background: colors.surfaceMuted, text: colors.textMuted },
};

export function Chip({ label, tone = "muted" }: ChipProps) {
  const { background, text } = palette[tone];

  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
});
