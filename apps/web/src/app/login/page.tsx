"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Card, CardContent, Divider, Stack, TextField, Typography } from "@mui/material";
import CellTowerIcon from "@mui/icons-material/CellTower";
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

export default function LoginPage() {
  const { login, loginWithMicrosoft, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = React.useState("admin@ccip.local");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [msSubmitting, setMsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

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
            variant="outlined"
            size="large"
            startIcon={<MicrosoftLogo />}
            onClick={handleMicrosoftSignIn}
            disabled={msSubmitting || !MICROSOFT_LOGIN_CONFIGURED}
            sx={{ mb: 1, textTransform: "none", borderColor: "divider", color: "text.primary" }}
          >
            {msSubmitting ? "Signing in…" : "Sign in with Tata Communications (Microsoft)"}
          </Button>
          {!MICROSOFT_LOGIN_CONFIGURED && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              Microsoft sign-in isn&apos;t configured on this deployment yet.
            </Typography>
          )}

          <Divider sx={{ my: 2 }}>
            <Typography variant="caption" color="text.secondary">
              OR SIGN IN WITH LOCAL CREDENTIALS
            </Typography>
          </Divider>

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
