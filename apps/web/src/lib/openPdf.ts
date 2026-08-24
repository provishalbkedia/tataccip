import { api, ApiError } from "./api";

/** Fetches an MNO's IR.21 PDF (with auth) and opens it in a new tab via a
 * blob URL — a plain link/window.open to the API URL can't carry the
 * Authorization header a direct navigation would need. */
export async function openMnoPdf(mnoId: number): Promise<void> {
  try {
    const blob = await api.getBlob(`/mno/${mnoId}/pdf`);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // Revoke after a delay rather than immediately — the new tab needs time
    // to actually load the blob URL before it's invalidated.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    alert(err instanceof ApiError ? err.message : "Failed to open PDF");
  }
}
