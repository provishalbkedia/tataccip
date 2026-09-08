import { BrowserAuthError, PublicClientApplication, Configuration } from "@azure/msal-browser";

// The sessionStorage key MSAL sets for the duration of a popup/redirect
// flow (see @azure/msal-browser's BrowserCacheManager) and only clears once
// that flow resolves cleanly. Hardcoded here rather than imported since
// msal-browser doesn't export it as public API.
const MSAL_INTERACTION_STATUS_KEY = "msal.interaction.status";

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
    // The app registration is single-tenant (Tata Communications only, set
    // in Azure Portal's "Supported account types"), so the authority points
    // straight at that tenant rather than the generic "organizations"
    // endpoint -- that's the pattern Microsoft recommends for single-tenant
    // apps (skips home-realm-discovery ambiguity for personal/other-org
    // accounts, and Azure AD itself refuses to issue a token for any tenant
    // but this one regardless). Falls back to "organizations" if the tenant
    // ID hasn't been configured yet, so a deployment mid-rollout still
    // works. @tatacommunications.com is enforced again server-side either
    // way (defense in depth, not reliance on this alone).
    const tenantId = process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID;
    const config: Configuration = {
      auth: {
        clientId: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID ?? "",
        authority: `https://login.microsoftonline.com/${tenantId ?? "organizations"}`,
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
  try {
    const result = await getMsalInstance().loginPopup({
      scopes: ["openid", "profile", "email"],
      prompt: "select_account",
    });
    return result.idToken;
  } catch (err) {
    // MSAL throws this instantly, before even opening a popup, whenever its
    // sessionStorage "interaction in progress" flag is already set -- which
    // happens legitimately while a popup is genuinely open, but can also be
    // left stuck by a prior attempt that never resolved cleanly (blocked
    // popup, closed by the user, a corporate proxy interfering with the
    // popup's postMessage back to this window). This function only runs in
    // response to the user just clicking the sign-in button on this page,
    // so no interaction can genuinely still be in flight here -- clear the
    // stale flag and retry exactly once rather than leaving the user stuck
    // in a state only a manual sessionStorage clear or private window can
    // escape.
    if (err instanceof BrowserAuthError && err.errorCode === "interaction_in_progress") {
      try {
        window.sessionStorage.removeItem(MSAL_INTERACTION_STATUS_KEY);
      } catch {
        // Private browsing / storage blocked -- nothing more to clear.
      }
      const result = await getMsalInstance().loginPopup({
        scopes: ["openid", "profile", "email"],
        prompt: "select_account",
      });
      return result.idToken;
    }
    throw err;
  }
}
