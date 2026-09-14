import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";
import { LocksmithStackParamList } from "../../navigation/types";
import { ISSUE_LABELS, ServiceRequest } from "../../types";
import { api, ApiError } from "../../api/client";
import { getSocket } from "../../api/socket";

type Props = NativeStackScreenProps<LocksmithStackParamList, "JobDetail">;

export function JobDetailScreen({ route, navigation }: Props) {
  const { requestId } = route.params;
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [finalPrice, setFinalPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<{ request: ServiceRequest }>(`/requests/${requestId}`);
    setRequest(res.request);
    setFinalPrice(String(res.request.priceEstimateMax ?? ""));
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 8000, distanceInterval: 25 },
        (loc) => {
          getSocket()?.emit("locksmith:location", {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            requestId,
          });
        }
      );
    })();
    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [requestId]);

  async function markArrived() {
    setUpdating(true);
    try {
      const res = await api.patch<{ request: ServiceRequest }>(`/requests/${requestId}/status`, { status: "ARRIVED" });
      setRequest(res.request);
    } catch (e) {
      Alert.alert("Erreur", e instanceof ApiError ? e.message : "Impossible de mettre à jour le statut");
    } finally {
      setUpdating(false);
    }
  }

  async function markCompleted() {
    const price = Number(finalPrice);
    if (!price || price <= 0) {
      Alert.alert("Montant invalide", "Indiquez le montant final de l'intervention.");
      return;
    }
    setUpdating(true);
    try {
      await api.patch(`/requests/${requestId}/status`, { status: "COMPLETED", finalPrice: price });
      navigation.popToTop();
    } catch (e) {
      Alert.alert("Erreur", e instanceof ApiError ? e.message : "Impossible de terminer l'intervention");
    } finally {
      setUpdating(false);
    }
  }

  if (loading || !request) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
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
        <Marker coordinate={{ latitude: request.latitude, longitude: request.longitude }} title="Client" pinColor={colors.primary} />
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.issue}>{ISSUE_LABELS[request.issueType]}</Text>
        {request.description ? <Text style={styles.description}>{request.description}</Text> : null}
        {request.address ? <Text style={styles.address}>{request.address}</Text> : null}

        <Button
          label="Ouvrir dans le GPS"
          variant="secondary"
          onPress={() =>
            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${request.latitude},${request.longitude}`)
          }
        />

        {request.status === "ACCEPTED" && (
          <Button label="Je suis arrivé" onPress={markArrived} loading={updating} />
        )}

        {request.status === "ARRIVED" && (
          <>
            <Text style={styles.label}>Montant final (€)</Text>
            <TextInput
              style={styles.input}
              value={finalPrice}
              onChangeText={setFinalPrice}
              keyboardType="numeric"
            />
            <Button label="Terminer l'intervention" onPress={markCompleted} loading={updating} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  map: { flex: 1 },
  panel: { backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm },
  issue: { color: colors.text, fontSize: 18, fontWeight: "700" },
  description: { color: colors.textMuted },
  address: { color: colors.textMuted, marginBottom: spacing.sm },
  label: { color: colors.textMuted, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
