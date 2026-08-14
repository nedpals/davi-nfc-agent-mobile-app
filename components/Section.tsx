import { StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { colors, fontFamily, radius, shadows, spacing, typography } from "@/constants/theme";

interface SectionProps {
  title: string;
  footer?: string;
  children: ReactNode;
}

export function Section({ title, footer, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "default" | "muted" | "success" | "warning" | "danger";
  last?: boolean;
}

const toneColor = {
  default: colors.text,
  muted: colors.textMuted,
  success: colors.successText,
  warning: colors.warningText,
  danger: colors.dangerText,
} as const;

export function InfoRow({ label, value, mono, tone = "default", last }: InfoRowProps) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, { color: toneColor[tone] }, mono && styles.rowValueMono]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  footer: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginHorizontal: spacing.xs,
    lineHeight: 17,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  rowLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  rowValue: {
    ...typography.label,
    flexShrink: 1,
    textAlign: "right",
  },
  rowValueMono: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
  },
});
