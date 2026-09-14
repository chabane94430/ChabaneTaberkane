import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { colors, spacing } from "../../theme";
import { AuthStackParamList } from "../../navigation/types";
import { Role } from "../../types";
import { ApiError } from "../../api/client";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [role, setRole] = useState<Role>("CLIENT");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await register({ fullName, email: email.trim().toLowerCase(), phone: phone || undefined, password, role });
    } catch (e) {
      Alert.alert("Inscription impossible", e instanceof ApiError ? e.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = fullName.length > 1 && email.includes("@") && password.length >= 8;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={styles.title}>Créer un compte</Text>

        <View style={styles.roleSwitch}>
          <Button
            label="Je cherche un serrurier"
            variant={role === "CLIENT" ? "primary" : "secondary"}
            onPress={() => setRole("CLIENT")}
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label="Je suis serrurier"
            variant={role === "LOCKSMITH" ? "primary" : "secondary"}
            onPress={() => setRole("LOCKSMITH")}
          />
        </View>

        <Field label="Nom complet" value={fullName} onChangeText={setFullName} placeholder="Jean Dupont" />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="vous@exemple.com"
        />
        <Field label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="06 12 34 56 78" />
        <Field label="Mot de passe (8 caractères min.)" value={password} onChangeText={setPassword} secureTextEntry />

        <Button label="S'inscrire" onPress={handleSubmit} loading={loading} disabled={!canSubmit} />

        <View style={styles.footer}>
          <Button label="J'ai déjà un compte" variant="secondary" onPress={() => navigation.navigate("Login")} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: 26, fontWeight: "800", marginBottom: spacing.lg },
  roleSwitch: { marginBottom: spacing.lg },
  footer: { marginTop: spacing.md },
});
