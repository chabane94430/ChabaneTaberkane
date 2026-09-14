import React, { useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";
import { api, ApiError, uploadFile } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { VerificationStatus } from "../../types";

const STATUS_LABELS: Record<VerificationStatus, string> = {
  UNVERIFIED: "Non vérifié",
  PENDING: "En cours de vérification",
  VERIFIED: "Identité vérifiée",
  REJECTED: "Document refusé — merci d'en soumettre un nouveau",
};

const STATUS_COLORS: Record<VerificationStatus, string> = {
  UNVERIFIED: colors.textMuted,
  PENDING: colors.primary,
  VERIFIED: colors.success,
  REJECTED: colors.danger,
};

export function IdVerificationScreen() {
  const { user, refreshUser } = useAuth();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const status = user?.locksmithProfile?.verificationStatus ?? "UNVERIFIED";

  async function handlePick() {
    const { status: permStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const picker =
      permStatus === "granted"
        ? ImagePicker.launchCameraAsync({ quality: 0.7 })
        : ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    const result = await picker;
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleSubmit() {
    if (!photoUri) return;
    setUploading(true);
    try {
      await uploadFile("/users/me/locksmith-profile/id-document", "document", {
        uri: photoUri,
        name: "id-document.jpg",
        type: "image/jpeg",
      });
      await refreshUser();
      setPhotoUri(null);
      Alert.alert("Document envoyé", "Votre pièce d'identité a été transmise pour vérification.");
    } catch (e) {
      Alert.alert("Erreur", e instanceof ApiError ? e.message : "Impossible d'envoyer le document");
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vérification d'identité</Text>
      <Text style={styles.subtitle}>
        Une pièce d'identité vérifiée rassure les clients et augmente vos chances d'être choisi.
      </Text>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />
        <Text style={styles.statusText}>{STATUS_LABELS[status]}</Text>
      </View>

      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.preview} />
      ) : (
        <Button label="Prendre / choisir une photo de ma pièce d'identité" variant="secondary" onPress={handlePick} />
      )}

      {photoUri && (
        <>
          <View style={{ height: spacing.sm }} />
          <Button label="Envoyer" onPress={handleSubmit} loading={uploading} />
          <View style={{ height: spacing.sm }} />
          <Button label="Reprendre" variant="secondary" onPress={() => setPhotoUri(null)} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: spacing.xs },
  subtitle: { color: colors.textMuted, marginBottom: spacing.lg },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: colors.text, fontWeight: "600" },
  preview: { width: "100%", height: 220, borderRadius: 12, marginBottom: spacing.sm },
});
