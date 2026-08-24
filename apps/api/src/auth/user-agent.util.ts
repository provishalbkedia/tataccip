// Best-effort "Browser on OS" label from a User-Agent header — good enough
// to tell logins apart in an activity log, not a precise device fingerprint.
// Order matters: Edge/Opera UAs also contain "Chrome" and "Safari" tokens,
// so those must be checked first.
export function parseBrowserOs(userAgent: string | undefined): string | null {
  if (!userAgent) return null;

  let browser = "Unknown browser";
  if (/Edg\//.test(userAgent)) browser = "Edge";
  else if (/OPR\/|Opera/.test(userAgent)) browser = "Opera";
  else if (/Firefox\//.test(userAgent)) browser = "Firefox";
  else if (/Chrome\//.test(userAgent)) browser = "Chrome";
  else if (/Safari\//.test(userAgent)) browser = "Safari";

  let os = "unknown OS";
  if (/Windows/.test(userAgent)) os = "Windows";
  else if (/Mac OS X/.test(userAgent)) os = "macOS";
  else if (/Android/.test(userAgent)) os = "Android";
  else if (/iPhone|iPad|iOS/.test(userAgent)) os = "iOS";
  else if (/Linux/.test(userAgent)) os = "Linux";

  return `${browser} on ${os}`;
}
