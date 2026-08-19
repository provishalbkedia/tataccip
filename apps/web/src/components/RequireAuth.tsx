"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress, Typography } from "@mui/material";
import { Role } from "@ccip/shared-types";
import { useAuth } from "@/lib/auth-context";

export default function RequireAuth({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: Role[];
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="h6">Access restricted</Typography>
        <Typography color="text.secondary">
          Your role ({user.role}) does not have permission to view this page.
        </Typography>
      </Box>
    );
  }

  return <>{children}</>;
}
