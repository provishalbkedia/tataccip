"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "@/lib/auth-context";

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    // MSAL's loginPopup redirectUri is this bare origin, so this page also
    // mounts *inside the popup* right after Microsoft redirects it back,
    // carrying the auth response. @azure/msal-browser v5's popup flow
    // (unlike older versions) doesn't poll the popup's URL for that
    // response from the opener side -- the redirect-landing page itself
    // must explicitly relay it back over a BroadcastChannel by calling
    // broadcastResponseToMainFrame() (see @azure/msal-browser/redirect-
    // bridge) and then close itself; nothing does that automatically.
    // Without this, the popup just sits here rendering the app instead of
    // ever closing, and signInWithMicrosoft() in the opener never
    // resolves. window.opener is only ever set when this page was opened
    // as a popup (never for a normal top-level visit), so this only runs
    // there.
    if (typeof window !== "undefined" && window.opener) {
      import("@azure/msal-browser/redirect-bridge")
        .then(({ broadcastResponseToMainFrame }) => broadcastResponseToMainFrame())
        .catch(() => {
          // Not actually carrying a pending auth response (e.g. this page
          // got popped open some other way) -- nothing more this stray
          // popup should be doing, so just close it rather than leaving it
          // sitting on a spinner forever.
          try {
            window.close();
          } catch {
            // Nothing more to do.
          }
        });
      return;
    }
    if (!loading) {
      router.replace(user ? "/dashboard" : "/login");
    }
  }, [loading, user, router]);

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <CircularProgress />
    </Box>
  );
}
