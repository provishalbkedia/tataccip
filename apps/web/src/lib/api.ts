const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ccip_token");
}

// A 401 here always means the token itself is dead (expired past its 24h
// lifetime, or the account was deactivated/its role changed — see
// JwtStrategy) — there's no separate refresh token to fall back to (see
// auth-context.tsx's sliding periodic refresh for the mechanism that's
// supposed to prevent this while a session is active). Requests made with
// no token at all (`getToken()` returned null) skip this — that's a normal
// logged-out state the caller already expects, not a session dropping out
// from under the user, so it shouldn't force a redirect.
function handleUnauthorized(hadToken: boolean) {
  if (typeof window === "undefined" || !hadToken) return;
  window.localStorage.removeItem("ccip_token");
  window.localStorage.removeItem("ccip_user");
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized(!!token);
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(Array.isArray(message) ? message.join(", ") : message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Fire-and-forget ping to /health — wakes an idle Cloud Run instance up
 * before the user's first real request hits it. No auth header (the
 * endpoint doesn't need one), and failures are swallowed since this is
 * purely a warm-up nicety, not something the caller should have to handle. */
async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Same as api.postForm but reports upload progress (0-1) via XHR — plain
 * fetch() doesn't expose upload progress events, which matters for a
 * multi-hundred-file batch upload. */
function postFormWithProgress<T>(path: string, formData: FormData, onProgress?: (ratio: number) => void): Promise<T> {
  const token = getToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}${path}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
      } else {
        const message = (body as { message?: string | string[] })?.message ?? xhr.statusText;
        reject(new ApiError(Array.isArray(message) ? message.join(", ") : message, xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("Network error", 0));
    xhr.send(formData);
  });
}

/** For binary responses (e.g. PDFs) that need the Authorization header —
 * a plain `<a href>`/`window.open` to an API URL can't attach that header,
 * so the caller fetches the bytes here and opens/downloads the resulting
 * blob URL instead. */
async function getBlob(path: string): Promise<Blob> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!res.ok) {
    throw new ApiError(res.statusText, res.status);
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  postForm: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
  postFormWithProgress,
  getBlob,
  ping,
};
