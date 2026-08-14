import { Children, Fragment, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
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

/**
 * Rules between rows, drawn between them rather than under each one — so a row
 * added at the end cannot leave a line hanging above nothing, and no row has to
 * know whether it is the last.
 */
export function InfoRows({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);

  return (
    <>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 && <View style={styles.separator} />}
          {row}
        </Fragment>
      ))}
    </>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "default" | "muted" | "success" | "warning" | "danger";
}

const toneColor = {
  default: colors.text,
  muted: colors.textMuted,
  success: colors.successText,
  warning: colors.warningText,
  danger: colors.dangerText,
} as const;

export function InfoRow({ label, value, mono, tone = "default" }: InfoRowProps) {
  return (
    <View style={styles.row}>
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
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
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
