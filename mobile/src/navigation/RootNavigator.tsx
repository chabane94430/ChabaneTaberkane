import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { AuthNavigator } from "./AuthNavigator";
import { ClientNavigator } from "./ClientNavigator";
import { LocksmithNavigator } from "./LocksmithNavigator";
import { colors } from "../theme";

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, primary: colors.primary },
};

export function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {!user ? <AuthNavigator /> : user.role === "CLIENT" ? <ClientNavigator /> : <LocksmithNavigator />}
    </NavigationContainer>
  );
}
