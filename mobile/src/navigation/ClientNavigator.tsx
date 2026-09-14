import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ClientStackParamList } from "./types";
import { colors } from "../theme";
import { ClientHomeScreen } from "../screens/client/ClientHomeScreen";
import { NewRequestScreen } from "../screens/client/NewRequestScreen";
import { TrackingScreen } from "../screens/client/TrackingScreen";
import { RateJobScreen } from "../screens/client/RateJobScreen";

const Stack = createNativeStackNavigator<ClientStackParamList>();

export function ClientNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="ClientHome" component={ClientHomeScreen} options={{ title: "Serrurier Express" }} />
      <Stack.Screen name="NewRequest" component={NewRequestScreen} options={{ title: "Nouvelle demande" }} />
      <Stack.Screen name="Tracking" component={TrackingScreen} options={{ title: "Suivi" }} />
      <Stack.Screen name="RateJob" component={RateJobScreen} options={{ title: "Votre avis" }} />
    </Stack.Navigator>
  );
}
