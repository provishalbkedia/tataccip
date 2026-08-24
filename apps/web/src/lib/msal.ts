import { PublicClientApplication, Configuration } from "@azure/msal-browser";

export const MICROSOFT_LOGIN_CONFIGURED = !!process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;

let instance: PublicClientApplication | null = null;
let initPromise: Promise<void> | null = null;

// Constructed lazily, only once a sign-in is actually attempted — not at
// module load — so a deployment that hasn't set NEXT_PUBLIC_MICROSOFT_
// CLIENT_ID yet never risks MSAL erroring out just from the login page
// rendering (local username/password sign-in must keep working regardless
// of whether Microsoft SSO has been configured).
function getMsalInstance(): PublicClientApplication {
  if (!instance) {
    // "organizations" (not "common") — this app is only ever meant for a
    // corporate/work account (@tatacommunications.com is enforced again
    // server-side regardless), so personal Microsoft accounts aren't
    // offered as a sign-in option in the popup at all.
    const config: Configuration = {
      auth: {
        clientId: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID ?? "",
        authority: "https://login.microsoftonline.com/organizations",
        redirectUri: typeof window !== "undefined" ? window.location.origin : undefined,
      },
      cache: {
        cacheLocation: "sessionStorage",
      },
    };
    instance = new PublicClientApplication(config);
  }
  return instance;
}

function ensureMsalInitialized(): Promise<void> {
  if (!initPromise) initPromise = getMsalInstance().initialize();
  return initPromise;
}

/** Opens the Microsoft sign-in popup and returns the raw ID token for the
 * backend to verify — POST /auth/microsoft never trusts this token's claims
 * until it re-verifies the signature server-side against Microsoft's own
 * JWKS, so nothing here needs to be treated as authoritative client-side. */
export async function signInWithMicrosoft(): Promise<string> {
  if (!MICROSOFT_LOGIN_CONFIGURED) {
    throw new Error("Microsoft sign-in is not configured (NEXT_PUBLIC_MICROSOFT_CLIENT_ID is unset)");
  }
  await ensureMsalInitialized();
  const result = await getMsalInstance().loginPopup({
    scopes: ["openid", "profile", "email"],
    prompt: "select_account",
  });
  return result.idToken;
}
