"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Role, LoginResponse } from "@ccip/shared-types";
import { api } from "./api";

interface AuthUser {
  id: number;
  email: string;
  role: Role;
  name?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithMicrosoft: () => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

// How often to silently re-sign the access token while a tab stays open —
// comfortably inside the 24h expiry (see apps/api/src/auth/auth.module.ts)
// so an active session never actually reaches it. POST /auth/refresh only
// succeeds with a still-valid token, so this is a sliding-session renewal,
// not a way to resurrect an already-dead one.
const SILENT_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();

  const applySession = React.useCallback((res: LoginResponse) => {
    window.localStorage.setItem("ccip_token", res.accessToken);
    window.localStorage.setItem("ccip_user", JSON.stringify(res.user));
    setUser(res.user);
  }, []);

  React.useEffect(() => {
    const storedUser = window.localStorage.getItem("ccip_user");
    const storedToken = window.localStorage.getItem("ccip_token");
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
    // Warms an idle Cloud Run instance up before the user's first real
    // request hits it — a plain ping, doesn't need a session to exist.
    api.ping();
  }, []);

  React.useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      api.post<LoginResponse>("/auth/refresh").then(applySession).catch(() => {
        // A failed refresh means the token is already dead (expired,
        // deactivated, role changed) — api.ts's own 401 handling has
        // already cleared the session and redirected by the time this
        // runs, so there's nothing further to do here.
      });
    }, SILENT_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, applySession]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      applySession(await api.post<LoginResponse>("/auth/login", { email, password }));
    },
    [applySession],
  );

  const loginWithMicrosoft = React.useCallback(async () => {
    // Dynamically imported — @azure/msal-browser is a sizeable dependency
    // that only the login page's Microsoft button ever needs; a static
    // import here would pull it into every page's bundle via AuthProvider
    // wrapping the whole app.
    const { signInWithMicrosoft } = await import("./msal");
    const idToken = await signInWithMicrosoft();
    applySession(await api.post<LoginResponse>("/auth/microsoft", { idToken }));
  }, [applySession]);

  const logout = React.useCallback(() => {
    window.localStorage.removeItem("ccip_token");
    window.localStorage.removeItem("ccip_user");
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithMicrosoft, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
