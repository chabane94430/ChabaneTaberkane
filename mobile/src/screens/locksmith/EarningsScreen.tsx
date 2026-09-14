import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../../theme";
import { ISSUE_LABELS, ServiceRequest } from "../../types";
import { api } from "../../api/client";

export function EarningsScreen() {
  const [jobs, setJobs] = useState<ServiceRequest[]>([]);

  useEffect(() => {
    api.get<{ requests: ServiceRequest[] }>("/requests/mine").then((res) => {
      setJobs(res.requests.filter((r) => r.status === "COMPLETED"));
    });
  }, []);

  const total = jobs.reduce((sum, job) => sum + (job.finalPrice ?? 0), 0);

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Total gagné</Text>
        <Text style={styles.summaryValue}>{total} €</Text>
        <Text style={styles.summaryMeta}>{jobs.length} intervention(s) terminée(s)</Text>
      </View>

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Aucune intervention terminée pour le moment.</Text>}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemIssue}>{ISSUE_LABELS[item.issueType]}</Text>
            <Text style={styles.itemDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            <Text style={styles.itemPrice}>{item.finalPrice} €</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  summary: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.lg, marginBottom: spacing.lg, alignItems: "center" },
  summaryLabel: { color: colors.textMuted },
  summaryValue: { color: colors.primary, fontSize: 32, fontWeight: "800", marginVertical: spacing.xs },
  summaryMeta: { color: colors.textMuted, fontSize: 12 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemIssue: { color: colors.text, fontWeight: "600", flex: 1 },
  itemDate: { color: colors.textMuted, fontSize: 12, marginRight: spacing.sm },
  itemPrice: { color: colors.primary, fontWeight: "700" },
});
