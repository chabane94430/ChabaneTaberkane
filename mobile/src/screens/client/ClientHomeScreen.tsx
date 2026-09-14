import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";
import { ClientStackParamList } from "../../navigation/types";
import { ISSUE_LABELS, ServiceRequest } from "../../types";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

type Props = NativeStackScreenProps<ClientStackParamList, "ClientHome">;

export function ClientHomeScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get<{ requests: ServiceRequest[] }>("/requests/mine");
    setRequests(res.requests);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const activeRequest = requests.find((r) => r.status === "PENDING" || r.status === "ACCEPTED" || r.status === "ARRIVED");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Bonjour {user?.fullName?.split(" ")[0]}</Text>
        <Button label="Déconnexion" variant="secondary" onPress={logout} />
      </View>

      {activeRequest ? (
        <View style={styles.activeCard}>
          <Text style={styles.activeTitle}>Demande en cours</Text>
          <Text style={styles.activeIssue}>{ISSUE_LABELS[activeRequest.issueType]}</Text>
          <Button label="Voir le suivi" onPress={() => navigation.navigate("Tracking", { requestId: activeRequest.id })} />
        </View>
      ) : (
        <Button label="Appeler un serrurier" onPress={() => navigation.navigate("NewRequest")} />
      )}

      <Text style={styles.sectionTitle}>Historique</Text>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListEmptyComponent={<Text style={styles.empty}>Aucune demande pour le moment.</Text>}
        renderItem={({ item }) => (
          <View style={styles.historyItem}>
            <Text style={styles.historyIssue}>{ISSUE_LABELS[item.issueType]}</Text>
            <Text style={styles.historyMeta}>
              {new Date(item.createdAt).toLocaleDateString()} · {item.status}
            </Text>
            {item.finalPrice && <Text style={styles.historyPrice}>{item.finalPrice} €</Text>}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  greeting: { color: colors.text, fontSize: 20, fontWeight: "700" },
  activeCard: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, marginBottom: spacing.lg, gap: spacing.sm },
  activeTitle: { color: colors.primary, fontWeight: "700" },
  activeIssue: { color: colors.text, marginBottom: spacing.sm },
  sectionTitle: { color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  historyItem: { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  historyIssue: { color: colors.text, fontWeight: "600" },
  historyMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  historyPrice: { color: colors.primary, marginTop: spacing.xs, fontWeight: "700" },
});
