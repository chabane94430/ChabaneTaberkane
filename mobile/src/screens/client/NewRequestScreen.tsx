import React, { useEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";
import { ClientStackParamList } from "../../navigation/types";
import { ISSUE_LABELS, IssueType, ServiceRequest } from "../../types";
import { api, ApiError, uploadFile } from "../../api/client";

type Props = NativeStackScreenProps<ClientStackParamList, "NewRequest">;

const ISSUE_TYPES = Object.keys(ISSUE_LABELS) as IssueType[];

export function NewRequestScreen({ navigation }: Props) {
  const [issueType, setIssueType] = useState<IssueType>("DOOR_LOCKOUT");
  const [description, setDescription] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Localisation requise",
          "Autorisez la localisation pour trouver un serrurier proche de vous."
        );
        setLocating(false);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setLocating(false);
    })();
  }, []);

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photos", "Autorisez l'accès aux photos pour joindre une image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function handleSubmit() {
    if (!coords) {
      Alert.alert("Position introuvable", "Impossible de récupérer votre position.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ request: ServiceRequest; notifiedLocksmiths: number }>("/requests", {
        issueType,
        description: description || undefined,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });

      if (photoUri) {
        // Best-effort: a failed photo upload shouldn't block the request itself, the
        // locksmith can still see the description and location.
        await uploadFile(`/requests/${res.request.id}/photos`, "photo", {
          uri: photoUri,
          name: "issue.jpg",
          type: "image/jpeg",
        }).catch((e) => console.warn("Photo upload failed", e));
      }

      navigation.replace("Tracking", { requestId: res.request.id });
    } catch (e) {
      Alert.alert("Erreur", e instanceof ApiError ? e.message : "Impossible de créer la demande");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.title}>De quoi avez-vous besoin ?</Text>

      <View style={styles.grid}>
        {ISSUE_TYPES.map((type) => (
          <Button
            key={type}
            label={ISSUE_LABELS[type]}
            variant={issueType === type ? "primary" : "secondary"}
            onPress={() => setIssueType(type)}
          />
        ))}
      </View>

      <Text style={styles.label}>Décrivez votre situation (optionnel)</Text>
      <TextInput
        style={styles.textArea}
        placeholder="Ex: porte d'entrée bloquée, clé tournant dans le vide..."
        placeholderTextColor={colors.textMuted}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
      />

      <Text style={styles.label}>Photo (optionnel)</Text>
      {photoUri ? (
        <View style={styles.photoRow}>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          <Button label="Retirer" variant="secondary" onPress={() => setPhotoUri(null)} />
        </View>
      ) : (
        <Button label="Ajouter une photo" variant="secondary" onPress={handlePickPhoto} />
      )}

      <View style={{ height: spacing.md }} />

      <Text style={styles.locationStatus}>
        {locating
          ? "Localisation en cours..."
          : coords
          ? `Position détectée (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`
          : "Position indisponible — vérifiez les autorisations"}
      </Text>

      <Button
        label="Trouver un serrurier"
        onPress={handleSubmit}
        loading={submitting}
        disabled={!coords || locating}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: spacing.md },
  grid: { gap: spacing.sm, marginBottom: spacing.lg },
  label: { color: colors.textMuted, marginBottom: spacing.xs },
  textArea: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: spacing.md,
  },
  locationStatus: { color: colors.textMuted, marginBottom: spacing.lg, fontSize: 13 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  photoPreview: { width: 64, height: 64, borderRadius: 8 },
});
