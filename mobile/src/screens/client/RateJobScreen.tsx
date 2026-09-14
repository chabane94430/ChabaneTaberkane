import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";
import { ClientStackParamList } from "../../navigation/types";
import { api, ApiError } from "../../api/client";

type Props = NativeStackScreenProps<ClientStackParamList, "RateJob">;

export function RateJobScreen({ route, navigation }: Props) {
  const { requestId } = route.params;
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await api.post("/reviews", { requestId, rating, comment: comment || undefined });
      navigation.popToTop();
    } catch (e) {
      Alert.alert("Erreur", e instanceof ApiError ? e.message : "Impossible d'enregistrer l'avis");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Comment s'est passée l'intervention ?</Text>

      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable key={value} onPress={() => setRating(value)}>
            <Text style={[styles.star, value <= rating && styles.starActive]}>★</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.textArea}
        placeholder="Un commentaire (optionnel)"
        placeholderTextColor={colors.textMuted}
        value={comment}
        onChangeText={setComment}
        multiline
      />

      <Button label="Envoyer" onPress={handleSubmit} loading={submitting} />
      <View style={{ height: spacing.sm }} />
      <Button label="Passer" variant="secondary" onPress={() => navigation.popToTop()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: "center" },
  title: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: spacing.lg, textAlign: "center" },
  stars: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginBottom: spacing.lg },
  star: { fontSize: 40, color: colors.border },
  starActive: { color: colors.primary },
  textArea: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: spacing.lg,
  },
});
