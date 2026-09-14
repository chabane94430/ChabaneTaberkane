import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useStripe } from "@stripe/stripe-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";
import { ClientStackParamList } from "../../navigation/types";
import { api, ApiError } from "../../api/client";
import { STRIPE_PUBLISHABLE_KEY } from "../../api/config";
import { ServiceRequest } from "../../types";

type Props = NativeStackScreenProps<ClientStackParamList, "Payment">;

export function PaymentScreen({ route, navigation }: Props) {
  const { requestId } = route.params;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ clientSecret: string }>(`/requests/${requestId}/payment-intent`);
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: "Serrurier Express",
        paymentIntentClientSecret: res.clientSecret,
      });
      if (initError) {
        setError(initError.message);
      } else {
        setReady(true);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossible de préparer le paiement");
    } finally {
      setLoading(false);
    }
  }, [requestId, initPaymentSheet]);

  useEffect(() => {
    if (STRIPE_PUBLISHABLE_KEY) setup();
    else setLoading(false);
  }, [setup]);

  async function handlePay() {
    setPaying(true);
    try {
      const { error: payError } = await presentPaymentSheet();
      if (payError) {
        if (payError.code !== "Canceled") setError(payError.message);
      } else {
        navigation.replace("RateJob", { requestId });
      }
    } finally {
      setPaying(false);
    }
  }

  if (!STRIPE_PUBLISHABLE_KEY) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Paiement non configuré</Text>
        <Text style={styles.subtitle}>
          Cette instance de l'app n'a pas de clé Stripe configurée (EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY). Vous pouvez
          continuer sans payer en ligne pour le moment.
        </Text>
        <View style={{ height: spacing.lg }} />
        <Button label="Continuer" onPress={() => navigation.replace("RateJob", { requestId })} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Régler l'intervention</Text>
      {error ? (
        <>
          <Text style={styles.errorText}>{error}</Text>
          <View style={{ height: spacing.md }} />
          <Button label="Réessayer" onPress={setup} />
        </>
      ) : (
        <Button label="Payer maintenant" onPress={handlePay} loading={paying} disabled={!ready} />
      )}
      <View style={{ height: spacing.md }} />
      <Button label="Payer plus tard" variant="secondary" onPress={() => navigation.replace("RateJob", { requestId })} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: spacing.md, textAlign: "center" },
  subtitle: { color: colors.textMuted, textAlign: "center" },
  errorText: { color: colors.danger, textAlign: "center", marginBottom: spacing.sm },
});
