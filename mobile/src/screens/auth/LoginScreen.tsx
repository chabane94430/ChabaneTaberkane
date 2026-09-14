import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { colors, spacing } from "../../theme";
import { AuthStackParamList } from "../../navigation/types";
import { ApiError } from "../../api/client";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e) {
      Alert.alert("Connexion impossible", e instanceof ApiError ? e.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Serrurier Express</Text>
        <Text style={styles.subtitle}>Un serrurier près de chez vous, en quelques minutes.</Text>
      </View>

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="vous@exemple.com"
      />
      <Field
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
      />

      <Button label="Se connecter" onPress={handleSubmit} loading={loading} disabled={!email || !password} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Pas encore de compte ?</Text>
        <Button label="Créer un compte" variant="secondary" onPress={() => navigation.navigate("Register")} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: "center" },
  header: { marginBottom: spacing.xl },
  title: { color: colors.text, fontSize: 32, fontWeight: "800" },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs, fontSize: 15 },
  footer: { marginTop: spacing.lg, gap: spacing.sm },
  footerText: { color: colors.textMuted, textAlign: "center", marginBottom: spacing.sm },
});
