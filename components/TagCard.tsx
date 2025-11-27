import { View, Text, StyleSheet } from "react-native";
import type { ScannedTag } from "@/types/protocol";

interface TagCardProps {
  tag: ScannedTag;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 10) {
    return "Just now";
  }
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }
  return date.toLocaleDateString();
}

export function TagCard({ tag }: TagCardProps) {
  const scannedAt = tag.scannedAt instanceof Date ? tag.scannedAt : new Date(tag.scannedAt);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Last Scanned Tag</Text>
        <View
          style={[
            styles.statusBadge,
            tag.sentToServer ? styles.statusSent : styles.statusPending,
          ]}
        >
          <Text style={styles.statusText}>
            {tag.sentToServer ? "Sent" : "Local"}
          </Text>
        </View>
      </View>

      <View style={styles.uidContainer}>
        <Text style={styles.uidLabel}>UID</Text>
        <Text style={styles.uid}>{tag.uid}</Text>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>Technology</Text>
          <Text style={styles.detailValue}>{tag.technology}</Text>
        </View>
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>Type</Text>
          <Text style={styles.detailValue}>{tag.type}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.timestamp}>{formatTimeAgo(scannedAt)}</Text>
      </View>

      {tag.ndefMessage && tag.ndefMessage.records.length > 0 && (
        <View style={styles.ndefSection}>
          <Text style={styles.ndefLabel}>NDEF Content</Text>
          {tag.ndefMessage.records.map((record, index) => (
            <View key={index} style={styles.ndefRecord}>
              {record.content ? (
                <Text style={styles.ndefContent}>{record.content}</Text>
              ) : (
                <Text style={styles.ndefRaw}>
                  [{record.recordType || `TNF ${record.tnf}`}]
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusSent: {
    backgroundColor: "#D1FAE5",
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1F2937",
  },
  uidContainer: {
    marginBottom: 16,
  },
  uidLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 4,
  },
  uid: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    fontFamily: "monospace",
  },
  detailsRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  detail: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: "#374151",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
  timestamp: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  ndefSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  ndefLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 8,
  },
  ndefRecord: {
    backgroundColor: "#F9FAFB",
    padding: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  ndefContent: {
    fontSize: 14,
    color: "#1F2937",
  },
  ndefRaw: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "monospace",
  },
});
