import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";
import { api, ApiError } from "../../api/client";

export function PayoutSetupScreen() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ onboarded: boolean }>("/payments/locksmith-onboarding-status");
      setOnboarded(res.onboarded);
    } catch {
      setOnboarded(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleSetup() {
    setOpening(true);
    try {
      const res = await api.post<{ url: string }>("/payments/locksmith-onboarding-link");
      await Linking.openURL(res.url);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        Alert.alert(
          "Paiements non configurés",
          "Le serveur n'a pas encore de clé Stripe configurée. Contactez l'administrateur."
        );
      } else {
        Alert.alert("Erreur", e instanceof ApiError ? e.message : "Impossible d'ouvrir la configuration Stripe");
      }
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Paiements</Text>
      <Text style={styles.subtitle}>
        Configurez votre compte Stripe pour recevoir directement le paiement de vos interventions (moins la
        commission de la plateforme).
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: onboarded ? colors.success : colors.textMuted }]} />
          <Text style={styles.statusText}>{onboarded ? "Paiements activés" : "Paiements non configurés"}</Text>
        </View>
      )}

      <View style={{ height: spacing.lg }} />
      <Button
        label={onboarded ? "Mettre à jour mes informations bancaires" : "Configurer mes paiements"}
        onPress={handleSetup}
        loading={opening}
      />
      <View style={{ height: spacing.sm }} />
      <Button label="Actualiser le statut" variant="secondary" onPress={loadStatus} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: spacing.xs },
  subtitle: { color: colors.textMuted, marginBottom: spacing.lg },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: colors.text, fontWeight: "600" },
});
