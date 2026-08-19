"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Role, LoginResponse } from "@ccip/shared-types";
import { api } from "./api";

interface AuthUser {
  id: number;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();

  React.useEffect(() => {
    const storedUser = window.localStorage.getItem("ccip_user");
    const storedToken = window.localStorage.getItem("ccip_token");
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    const res = await api.post<LoginResponse>("/auth/login", { email, password });
    window.localStorage.setItem("ccip_token", res.accessToken);
    window.localStorage.setItem("ccip_user", JSON.stringify(res.user));
    setUser(res.user);
  }, []);

  const logout = React.useCallback(() => {
    window.localStorage.removeItem("ccip_token");
    window.localStorage.removeItem("ccip_user");
    setUser(null);
    router.push("/login");
  }, [router]);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
