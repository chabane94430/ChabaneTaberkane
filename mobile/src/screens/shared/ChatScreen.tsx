import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";
import { ChatMessage } from "../../types";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useSocketEvent } from "../../hooks/useSocketEvent";

// Shared between the client and locksmith stacks — both declare a "Chat" route with
// the same { requestId: string } params, so this doesn't need to be typed against
// either specific ParamList.
interface Props {
  route: { params: { requestId: string } };
}

export function ChatScreen({ route }: Props) {
  const { requestId } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    const res = await api.get<{ messages: ChatMessage[] }>(`/requests/${requestId}/messages`);
    setMessages(res.messages);
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent<{ message: ChatMessage }>(
    "message:new",
    useCallback(
      (payload) => {
        if (payload.message.requestId !== requestId) return;
        setMessages((prev) => (prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message]));
      },
      [requestId]
    )
  );

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setDraft("");
    try {
      const res = await api.post<{ message: ChatMessage }>(`/requests/${requestId}/messages`, { body });
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
    } catch {
      setDraft(body); // let the user retry
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.senderId === user?.id;
          return (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
              <Text style={[styles.bubbleTime, mine && styles.bubbleTextMine]}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Aucun message pour le moment.</Text>}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Écrire un message..."
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <Button label="Envoyer" onPress={handleSend} loading={sending} disabled={!draft.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  bubble: { maxWidth: "80%", borderRadius: 12, padding: spacing.sm, marginBottom: spacing.sm },
  bubbleMine: { backgroundColor: colors.primary, alignSelf: "flex-end" },
  bubbleTheirs: { backgroundColor: colors.surface, alignSelf: "flex-start" },
  bubbleText: { color: colors.text, fontSize: 15 },
  bubbleTextMine: { color: "#1A1200" },
  bubbleTime: { color: colors.textMuted, fontSize: 10, marginTop: 4, alignSelf: "flex-end" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
  },
});
