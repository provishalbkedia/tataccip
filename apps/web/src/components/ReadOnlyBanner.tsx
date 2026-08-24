"use client";

import { Alert } from "@mui/material";
import { Role } from "@ccip/shared-types";
import { useAuth } from "@/lib/auth-context";

export default function ReadOnlyBanner() {
  const { user } = useAuth();
  if (!user || user.role === Role.ADMIN) return null;

  return (
    <Alert severity="info" sx={{ mb: 3 }}>
      Read-Only Mode: You are viewing administrative features with read-only permissions. Action and
      modification controls are disabled.
    </Alert>
  );
}
