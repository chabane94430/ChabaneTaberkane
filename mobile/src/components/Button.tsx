import React from "react";
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, Text } from "react-native";
import { colors, spacing } from "../theme";

interface Props {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = "primary", loading, disabled }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "secondary" ? colors.primary : "#1A1200"} />
      ) : (
        <Text style={[styles.label, variant === "secondary" && styles.labelSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.primary },
  danger: { backgroundColor: colors.danger },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { color: "#1A1200", fontWeight: "700", fontSize: 16 },
  labelSecondary: { color: colors.primary },
});
