import { useRouter } from "expo-router";
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { TagCard } from "@/components/TagCard";
import { PERSISTED_HISTORY_LIMIT } from "@/constants/config";
import { colors, spacing, typography } from "@/constants/theme";
import { useNFC } from "@/hooks";

export default function HistoryScreen() {
  const router = useRouter();
  const { scanHistory, clearHistory } = useNFC();

  const handleClear = () => {
    Alert.alert("Clear scan history?", "This removes every scan kept on this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: clearHistory },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.action}>Close</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Scan history</Text>

        <TouchableOpacity
          onPress={handleClear}
          disabled={scanHistory.length === 0}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={[styles.action, scanHistory.length === 0 && styles.actionDisabled]}>
            Clear
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={scanHistory}
        keyExtractor={(tag, index) => `${tag.uid}-${tag.scannedAt.getTime()}-${index}`}
        renderItem={({ item }) => <TagCard tag={item} />}
        contentContainerStyle={[styles.list, scanHistory.length === 0 && styles.listEmpty]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            title="No scans yet"
            message="Tags you read appear here, newest first, whether or not the agent was listening."
          />
        }
      />

      {scanHistory.length > 0 && (
        <Text style={styles.footer}>
          {scanHistory.length} kept · the newest {PERSISTED_HISTORY_LIMIT} survive a restart
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  title: {
    ...typography.bodyStrong,
    fontSize: 17,
    color: colors.text,
  },
  action: {
    ...typography.body,
    color: colors.accentDeep,
    fontWeight: "600",
  },
  actionDisabled: {
    color: colors.disabled,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  listEmpty: {
    flexGrow: 1,
  },
  separator: {
    height: spacing.md,
  },
  footer: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
});
