import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, StyleSheet, Switch, Text, View } from "react-native";
import * as Location from "expo-location";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";
import { LocksmithStackParamList } from "../../navigation/types";
import { ISSUE_LABELS, ServiceRequest } from "../../types";
import { api, ApiError } from "../../api/client";
import { getSocket } from "../../api/socket";
import { useSocketEvent } from "../../hooks/useSocketEvent";
import { useAuth } from "../../context/AuthContext";

type Props = NativeStackScreenProps<LocksmithStackParamList, "Dashboard">;

type IncomingRequest = ServiceRequest & { distanceKm?: number };

export function DashboardScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [online, setOnline] = useState(false);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [activeJob, setActiveJob] = useState<ServiceRequest | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const loadActiveJob = useCallback(async () => {
    const res = await api.get<{ requests: ServiceRequest[] }>("/requests/mine");
    const active = res.requests.find((r) => r.status === "ACCEPTED" || r.status === "ARRIVED");
    setActiveJob(active ?? null);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", loadActiveJob);
    return unsubscribe;
  }, [navigation, loadActiveJob]);

  useSocketEvent<IncomingRequest>(
    "request:new",
    useCallback((payload) => {
      setIncoming((prev) => (prev.some((r) => r.id === payload.id) ? prev : [payload, ...prev]));
    }, [])
  );

  async function goOnline() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Localisation requise", "Autorisez la localisation pour recevoir des demandes.");
      return;
    }
    const position = await Location.getCurrentPositionAsync({});
    getSocket()?.emit("locksmith:online", {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });

    const nearby = await api.get<{ requests: IncomingRequest[] }>(
      `/requests/nearby?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}`
    );
    setIncoming(nearby.requests);

    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 50 },
      (loc) => {
        getSocket()?.emit("locksmith:location", {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    );

    setOnline(true);
  }

  function goOffline() {
    getSocket()?.emit("locksmith:offline");
    watchRef.current?.remove();
    watchRef.current = null;
    setOnline(false);
    setIncoming([]);
  }

  async function handleToggle(value: boolean) {
    if (value) await goOnline();
    else goOffline();
  }

  async function handleAccept(requestId: string) {
    try {
      await api.post(`/requests/${requestId}/accept`);
      setIncoming((prev) => prev.filter((r) => r.id !== requestId));
      navigation.navigate("JobDetail", { requestId });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setIncoming((prev) => prev.filter((r) => r.id !== requestId));
        Alert.alert("Trop tard", "Cette demande vient d'être prise par un autre serrurier.");
      } else {
        Alert.alert("Erreur", e instanceof ApiError ? e.message : "Impossible d'accepter la demande");
      }
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{user?.fullName}</Text>
          <Text style={styles.rating}>
            ★ {user?.locksmithProfile?.ratingAvg?.toFixed(1) ?? "5.0"} ({user?.locksmithProfile?.ratingCount ?? 0} avis)
          </Text>
        </View>
        <Button label="Déconnexion" variant="secondary" onPress={logout} />
      </View>

      <View style={styles.onlineRow}>
        <Text style={styles.onlineLabel}>{online ? "En ligne — vous recevez des demandes" : "Hors ligne"}</Text>
        <Switch value={online} onValueChange={handleToggle} trackColor={{ true: colors.primary }} />
      </View>

      {activeJob && (
        <View style={styles.activeCard}>
          <Text style={styles.activeTitle}>Intervention en cours</Text>
          <Text style={styles.activeIssue}>{ISSUE_LABELS[activeJob.issueType]}</Text>
          <Button label="Reprendre" onPress={() => navigation.navigate("JobDetail", { requestId: activeJob.id })} />
        </View>
      )}

      <Button label="Mes gains" variant="secondary" onPress={() => navigation.navigate("Earnings")} />

      <Text style={styles.sectionTitle}>Demandes à proximité</Text>
      <FlatList
        data={incoming}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {online ? "Aucune demande pour le moment." : "Passez en ligne pour recevoir des demandes."}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.requestCard}>
            <Text style={styles.requestIssue}>{ISSUE_LABELS[item.issueType]}</Text>
            {item.description ? <Text style={styles.requestDescription}>{item.description}</Text> : null}
            <Text style={styles.requestMeta}>
              {item.distanceKm !== undefined ? `${item.distanceKm} km · ` : ""}
              {item.priceEstimateMin}–{item.priceEstimateMax} €
            </Text>
            <Button label="Accepter" onPress={() => handleAccept(item.id)} disabled={!!activeJob} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.md },
  greeting: { color: colors.text, fontSize: 18, fontWeight: "700" },
  rating: { color: colors.primary, marginTop: 2 },
  onlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  onlineLabel: { color: colors.text, flex: 1, marginRight: spacing.sm },
  activeCard: { backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  activeTitle: { color: colors.primary, fontWeight: "700" },
  activeIssue: { color: colors.text, marginBottom: spacing.sm },
  sectionTitle: { color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  requestCard: { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.xs },
  requestIssue: { color: colors.text, fontWeight: "700", fontSize: 16 },
  requestDescription: { color: colors.textMuted },
  requestMeta: { color: colors.textMuted, marginBottom: spacing.xs },
});
