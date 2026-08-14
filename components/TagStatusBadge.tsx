import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

interface TagStatusBadgeProps {
  // Whether the agent has the scan, as opposed to this device alone.
  sent: boolean;
}

export function TagStatusBadge({ sent }: TagStatusBadgeProps) {
  return (
    <View style={[styles.badge, sent ? styles.sent : styles.local]}>
      <Text style={[styles.label, sent ? styles.labelSent : styles.labelLocal]}>
        {sent ? "Sent" : "Local"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  sent: {
    backgroundColor: colors.successSoft,
  },
  local: {
    backgroundColor: colors.warningSoft,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
  labelSent: {
    color: colors.successText,
  },
  labelLocal: {
    color: colors.warningText,
  },
});
