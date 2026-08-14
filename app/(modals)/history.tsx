import { useRouter } from "expo-router";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/components/EmptyState";
import { ModalHeader } from "@/components/ModalHeader";
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
      <ModalHeader
        title="Scan history"
        onClose={() => router.back()}
        actionLabel="Clear"
        onAction={handleClear}
        actionDisabled={scanHistory.length === 0}
      />

      <FlatList
        data={scanHistory}
        keyExtractor={(tag) => `${tag.uid}-${tag.scannedAt.getTime()}`}
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
