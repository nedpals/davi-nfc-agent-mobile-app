import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, spacing, typography } from "@/constants/theme";

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}

export function ModalHeader({
  title,
  onClose,
  closeLabel = "Close",
  actionLabel,
  onAction,
  actionDisabled,
}: ModalHeaderProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onClose}
        accessibilityRole="button"
        hitSlop={12}
        style={styles.side}
      >
        <Text style={styles.action}>{closeLabel}</Text>
      </TouchableOpacity>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.side, styles.right]}>
        {actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            disabled={actionDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!actionDisabled }}
            hitSlop={12}
          >
            <Text style={[styles.action, actionDisabled && styles.actionDisabled]}>
              {actionLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  // Equal sides keep the title centred whatever the actions are called.
  side: {
    flex: 1,
  },
  right: {
    alignItems: "flex-end",
  },
  title: {
    ...typography.bodyStrong,
    fontSize: 17,
    color: colors.text,
    textAlign: "center",
  },
  action: {
    ...typography.body,
    color: colors.link,
    fontWeight: "600",
  },
  actionDisabled: {
    color: colors.disabled,
  },
});
