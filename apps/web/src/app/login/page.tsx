"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Box, Button, Card, CardContent, Collapse, Link as MuiLink, Stack, TextField, Typography } from "@mui/material";
import CellTowerIcon from "@mui/icons-material/CellTower";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { MICROSOFT_LOGIN_CONFIGURED } from "@/lib/msal";

/** Official four-color Microsoft logo (not a MUI icon — Microsoft's brand
 * guidelines expect this exact glyph on sign-in buttons). */
function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** Compact ON/OFF capsule switch for the "Local Admin Login" toggle --
 * same hand-built pill/thumb pattern as AppShell's "AI Copilot" toggle, so
 * the two capsule switches in this app read as one design language. */
function MiniToggle({ on }: { on: boolean }) {
  return (
    <Box
      sx={{
        position: "relative",
        width: 34,
        height: 18,
        borderRadius: 999,
        bgcolor: on ? "#0A2540" : "#CBD5E1",
        transition: "background-color 0.2s ease",
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          bgcolor: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
          transition: "left 0.2s ease",
        }}
      />
    </Box>
  );
}

export default function LoginPage() {
  const { login, loginWithMicrosoft, user } = useAuth();
  const router = useRouter();
  // Microsoft SSO is the intended default sign-in path -- local credentials
  // are an emergency admin fallback, kept collapsed unless explicitly
  // opened. The one exception: a deployment where Microsoft sign-in isn't
  // configured at all (NEXT_PUBLIC_MICROSOFT_CLIENT_ID unset, e.g. local
  // dev) has no other way in, so hiding the only working method by default
  // would just be an extra click every single time, not a real safeguard.
  const [showLocalAdmin, setShowLocalAdmin] = React.useState<boolean>(!MICROSOFT_LOGIN_CONFIGURED);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [msSubmitting, setMsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  function toggleLocalAdmin() {
    setShowLocalAdmin((prev) => {
      const next = !prev;
      // Toggling back off clears any lingering credential/error state --
      // the emergency form should come back empty next time it's opened,
      // not resume a half-typed password from a prior attempt.
      if (!next) {
        setPassword("");
        setError(null);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMicrosoftSignIn() {
    setError(null);
    setMsSubmitting(true);
    try {
      await loginWithMicrosoft();
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Microsoft sign-in failed");
    } finally {
      setMsSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "primary.main",
        background: "linear-gradient(135deg, #0A2540 0%, #0B6FBF 100%)",
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Card sx={{ width: 400, borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <CellTowerIcon color="secondary" fontSize="large" />
            <Typography variant="h5" fontWeight={700}>
              CCIP
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Connectivity Coverage Intelligence Platform
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Button
            fullWidth
            variant="contained"
            startIcon={<MicrosoftLogo />}
            onClick={handleMicrosoftSignIn}
            disabled={msSubmitting || !MICROSOFT_LOGIN_CONFIGURED}
            sx={{
              height: 48,
              fontSize: "0.95rem",
              fontWeight: 700,
              textTransform: "none",
              bgcolor: "#0A2540",
              boxShadow: 2,
              "&:hover": { bgcolor: "#0A2540", boxShadow: 4 },
            }}
          >
            {msSubmitting ? "Signing in…" : "Sign in with Tata Communications (Microsoft)"}
          </Button>
          {!MICROSOFT_LOGIN_CONFIGURED && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              Microsoft sign-in isn&apos;t configured on this deployment yet.
            </Typography>
          )}

          <Box sx={{ display: "flex", justifyContent: "center", mt: 2.5, mb: showLocalAdmin ? 1.5 : 0 }}>
            <Box
              component="button"
              type="button"
              onClick={toggleLocalAdmin}
              role="switch"
              aria-checked={showLocalAdmin}
              aria-label={showLocalAdmin ? "Hide local admin login" : "Show local admin login"}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.75,
                border: "1px solid #E2E8F0",
                borderRadius: "20px",
                bgcolor: showLocalAdmin ? "#F1F5F9" : "transparent",
                py: 0.5,
                px: 1.5,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <AdminPanelSettingsOutlinedIcon sx={{ fontSize: 16, color: showLocalAdmin ? "#0A2540" : "#94A3B8" }} />
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748B" }}>Local Admin Login</Typography>
              <MiniToggle on={showLocalAdmin} />
            </Box>
          </Box>

          <Collapse in={showLocalAdmin} timeout="auto" unmountOnExit>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ textAlign: "center", fontWeight: 600, mb: 1.5 }}>
              Local Administrative Access Only
            </Typography>
            <form onSubmit={handleSubmit}>
              <Stack spacing={2}>
                <TextField
                  label="Email"
                  type="email"
                  placeholder="admin@ccip.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required={showLocalAdmin}
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={showLocalAdmin}
                  fullWidth
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={submitting}
                  fullWidth
                  sx={{ bgcolor: "#0A2540", "&:hover": { bgcolor: "#0A2540" } }}
                >
                  {submitting ? "Signing in…" : "SIGN IN AS ADMIN"}
                </Button>
              </Stack>
            </form>
          </Collapse>
        </CardContent>
      </Card>
      <Typography variant="caption" sx={{ mt: 3 }}>
        <MuiLink component={Link} href="/privacy" sx={{ color: "rgba(255,255,255,0.9)" }}>
          Privacy Policy
        </MuiLink>
      </Typography>
      </Box>
    </Box>
  );
}
