import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, setAuthToken } from "../api/client";
import { connectSocket, disconnectSocket } from "../api/socket";
import { Role, User } from "../types";

const STORAGE_KEY = "locksmith-app/session";

interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: Role;
}

interface AuthState {
  user?: User;
  token?: string;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | undefined>();
  const [token, setToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { token: string; user: User };
          setAuthToken(saved.token);
          setToken(saved.token);
          setUser(saved.user);
          connectSocket(saved.token);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (nextToken: string, nextUser: User) => {
    setAuthToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: nextToken, user: nextUser }));
    connectSocket(nextToken);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
      await persist(res.token, res.user);
    },
    [persist]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const res = await api.post<{ token: string; user: User }>("/auth/register", input);
      await persist(res.token, res.user);
    },
    [persist]
  );

  const logout = useCallback(async () => {
    setAuthToken(undefined);
    setToken(undefined);
    setUser(undefined);
    disconnectSocket();
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get<{ user: User }>("/users/me");
    setUser(res.user);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, refreshUser }),
    [user, token, loading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
