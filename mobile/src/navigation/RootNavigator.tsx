import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { useAuth } from "../context/AuthContext";
import { AuthNavigator } from "./AuthNavigator";
import { ClientNavigator } from "./ClientNavigator";
import { LocksmithNavigator } from "./LocksmithNavigator";
import { colors } from "../theme";
import { User } from "../types";

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, primary: colors.primary },
};

export const navigationRef = createNavigationContainerRef();

interface NotificationData {
  type?: "request:new" | "request:accepted" | "request:status";
  requestId?: string;
}

/** Routes a tapped push notification to the right screen. Client notifications
 * always carry a requestId to track; locksmith ones open the job if there's one
 * in progress, or fall back to the dashboard where the new request will appear. */
function navigateFromNotification(data: NotificationData, role: User["role"]) {
  if (!navigationRef.isReady() || !data.requestId) return;

  // The ref is shared across three differently-typed navigators (auth/client/locksmith),
  // so it can't carry a single precise ParamList — the routes below are guaranteed to
  // exist for the role we check against.
  const navigate = navigationRef.navigate as (name: string, params: object) => void;

  if (role === "CLIENT") {
    navigate("Tracking", { requestId: data.requestId });
  } else if (data.type === "request:accepted" || data.type === "request:status") {
    navigate("JobDetail", { requestId: data.requestId });
  }
}

export function RootNavigator() {
  const { user, loading } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as NotificationData;
      if (userRef.current) navigateFromNotification(data, userRef.current.role);
    });
    return () => subscription.remove();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {!user ? <AuthNavigator /> : user.role === "CLIENT" ? <ClientNavigator /> : <LocksmithNavigator />}
    </NavigationContainer>
  );
}
