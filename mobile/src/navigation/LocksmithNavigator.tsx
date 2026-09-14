import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LocksmithStackParamList } from "./types";
import { colors } from "../theme";
import { DashboardScreen } from "../screens/locksmith/DashboardScreen";
import { JobDetailScreen } from "../screens/locksmith/JobDetailScreen";
import { EarningsScreen } from "../screens/locksmith/EarningsScreen";
import { ChatScreen } from "../screens/shared/ChatScreen";
import { IdVerificationScreen } from "../screens/locksmith/IdVerificationScreen";
import { PayoutSetupScreen } from "../screens/locksmith/PayoutSetupScreen";

const Stack = createNativeStackNavigator<LocksmithStackParamList>();

export function LocksmithNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Serrurier Express Pro" }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: "Intervention" }} />
      <Stack.Screen name="Earnings" component={EarningsScreen} options={{ title: "Mes gains" }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: "Messages" }} />
      <Stack.Screen name="IdVerification" component={IdVerificationScreen} options={{ title: "Vérification d'identité" }} />
      <Stack.Screen name="PayoutSetup" component={PayoutSetupScreen} options={{ title: "Paiements" }} />
    </Stack.Navigator>
  );
}
