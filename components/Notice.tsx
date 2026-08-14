import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

type Tone = "danger" | "warning" | "muted" | "info";

interface NoticeProps {
  message: string;
  tone?: Tone;
  actionLabel?: string;
  onAction?: () => void;
}

const palette: Record<Tone, { background: string; text: string }> = {
  danger: { background: colors.dangerSoft, text: colors.dangerText },
  warning: { background: colors.warningSoft, text: colors.warningText },
  info: { background: colors.accentSoft, text: colors.accentDeep },
  muted: { background: colors.surfaceMuted, text: colors.textMuted },
};

export function Notice({ message, tone = "info", actionLabel, onAction }: NoticeProps) {
  const { background, text } = palette[tone];

  return (
    <View style={[styles.container, { backgroundColor: background }]} accessibilityRole="alert">
      <Text style={[styles.message, { color: text }]}>{message}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.action, { color: text }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  message: {
    ...typography.caption,
    flex: 1,
    lineHeight: 17,
  },
  action: {
    ...typography.caption,
    fontWeight: "700",
  },
});
