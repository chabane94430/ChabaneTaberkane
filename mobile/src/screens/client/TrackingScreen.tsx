import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";
import { ClientStackParamList } from "../../navigation/types";
import { ISSUE_LABELS, LocksmithSummary, ServiceRequest } from "../../types";
import { api, ApiError } from "../../api/client";
import { useSocketEvent } from "../../hooks/useSocketEvent";

type Props = NativeStackScreenProps<ClientStackParamList, "Tracking">;

const STATUS_LABELS: Record<ServiceRequest["status"], string> = {
  PENDING: "Recherche d'un serrurier disponible...",
  ACCEPTED: "Serrurier en route",
  ARRIVED: "Le serrurier est arrivé",
  COMPLETED: "Intervention terminée",
  CANCELLED: "Demande annulée",
};

export function TrackingScreen({ route, navigation }: Props) {
  const { requestId } = route.params;
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [locksmith, setLocksmith] = useState<LocksmithSummary | null>(null);
  const [locksmithPos, setLocksmithPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ request: ServiceRequest }>(`/requests/${requestId}`);
      setRequest(res.request);
    } catch {
      // ignore transient errors, socket events will keep us in sync
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent<{ request: ServiceRequest; locksmith?: LocksmithSummary }>(
    "request:accepted",
    useCallback(
      (payload) => {
        if (payload.request.id !== requestId) return;
        setRequest(payload.request);
        if (payload.locksmith) {
          setLocksmith(payload.locksmith);
          if (payload.locksmith.latitude && payload.locksmith.longitude) {
            setLocksmithPos({ latitude: payload.locksmith.latitude, longitude: payload.locksmith.longitude });
          }
        }
      },
      [requestId]
    )
  );

  useSocketEvent<{ request: ServiceRequest }>(
    "request:status",
    useCallback(
      (payload) => {
        if (payload.request.id !== requestId) return;
        setRequest(payload.request);
      },
      [requestId]
    )
  );

  useSocketEvent<{ requestId: string; latitude: number; longitude: number }>(
    "job:location",
    useCallback(
      (payload) => {
        if (payload.requestId !== requestId) return;
        setLocksmithPos({ latitude: payload.latitude, longitude: payload.longitude });
      },
      [requestId]
    )
  );

  async function handleCancel() {
    try {
      await api.patch(`/requests/${requestId}/status`, { status: "CANCELLED" });
      navigation.popToTop();
    } catch (e) {
      // no-op: surfaced via alert below if truly needed
    }
  }

  if (loading || !request) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (request.status === "COMPLETED") {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Intervention terminée</Text>
        <Text style={styles.subtitle}>Montant : {request.finalPrice ?? request.priceEstimateMax} €</Text>
        <View style={{ height: spacing.lg }} />
        <Button label="Laisser un avis" onPress={() => navigation.replace("RateJob", { requestId })} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: request.latitude,
          longitude: request.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <Marker coordinate={{ latitude: request.latitude, longitude: request.longitude }} title="Vous" pinColor={colors.primary} />
        {locksmithPos && <Marker coordinate={locksmithPos} title={locksmith?.fullName ?? "Serrurier"} pinColor={colors.success} />}
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.status}>{STATUS_LABELS[request.status]}</Text>
        <Text style={styles.issue}>{ISSUE_LABELS[request.issueType]}</Text>

        {locksmith && (
          <View style={styles.locksmithCard}>
            <Text style={styles.locksmithName}>{locksmith.fullName}</Text>
            {locksmith.rating !== undefined && (
              <Text style={styles.locksmithRating}>★ {locksmith.rating.toFixed(1)}</Text>
            )}
            {locksmith.phone && (
              <Button
                label={`Appeler ${locksmith.phone}`}
                variant="secondary"
                onPress={() => Linking.openURL(`tel:${locksmith.phone}`)}
              />
            )}
          </View>
        )}

        <Text style={styles.price}>
          Estimation : {request.priceEstimateMin}–{request.priceEstimateMax} €
        </Text>

        {(request.status === "PENDING" || request.status === "ACCEPTED") && (
          <Button label="Annuler la demande" variant="danger" onPress={handleCancel} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  map: { flex: 1 },
  panel: { backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm },
  status: { color: colors.text, fontSize: 18, fontWeight: "700" },
  issue: { color: colors.textMuted, marginBottom: spacing.sm },
  locksmithCard: { backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  locksmithName: { color: colors.text, fontSize: 16, fontWeight: "600" },
  locksmithRating: { color: colors.primary },
  price: { color: colors.text, marginBottom: spacing.md },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs },
});
