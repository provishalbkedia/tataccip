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
    // carrying the auth response in the URL hash (confirmed by inspecting
    // an actual failed sign-in: the popup briefly showed
    // "/#code=1.AQ8A...&state=..." before redirecting itself to /login).
    // @azure/msal-browser v5's popup flow (unlike older versions) doesn't
    // poll the popup's URL for that response from the opener side -- the
    // redirect-landing page itself must explicitly relay it back over a
    // BroadcastChannel by calling broadcastResponseToMainFrame() (see
    // @azure/msal-browser/redirect-bridge) and then close itself; nothing
    // does that automatically. Without this, the popup just sits there
    // rendering the app instead of ever closing, and
    // signInWithMicrosoft() in the opener never resolves.
    //
    // Detecting this via window.opener alone turned out unreliable in
    // production (it read false here even though this genuinely was the
    // MSAL popup -- exact cause unconfirmed, possibly a browser/extension
    // opener-severing policy), so this checks the URL hash itself instead:
    // an MSAL auth response always has "code=" (success) or "error="
    // (failure) in the hash, which normal top-level visits to "/" never
    // do. That's unambiguous ground truth regardless of window.opener.
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const hasAuthResponseInHash = /[#&](code|error)=/.test(hash);
    if (hasAuthResponseInHash) {
      import("@azure/msal-browser/redirect-bridge")
        .then(({ broadcastResponseToMainFrame }) => broadcastResponseToMainFrame())
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[msal redirect bridge] failed to relay auth response:", err);
          // Couldn't relay it to the opener -- still better to land the
          // user somewhere real than leave them stuck on this spinner.
          router.replace(user ? "/dashboard" : "/login");
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
