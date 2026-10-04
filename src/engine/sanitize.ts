/**
 * Sanitization.
 *
 * Magic Paste never forwards source markup. Parsers read only what the
 * document model can represent, and renderers emit a fixed allowlist of tags
 * with escaped text. The functions here are the two places untrusted strings
 * can reach the output: text content and URLs.
 */

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Returns a normalized absolute URL if it is safe to link to, otherwise null. */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip control characters and whitespace that browsers ignore inside URLs
  // (a classic way to smuggle "java\tscript:").
  const cleaned = raw.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '');
  if (!cleaned) return null;
  const candidate = /^www\./i.test(cleaned) ? `https://${cleaned}` : cleaned;
  try {
    // Validate with the URL parser, but keep the author's spelling of the link.
    return SAFE_SCHEMES.has(new URL(candidate).protocol) ? candidate : null;
  } catch {
    return null; // relative or malformed: keep the text, drop the link
  }
}

const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

export function safeImageSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (IMAGE_DATA_URL.test(raw)) return raw;
  const url = safeUrl(raw);
  return url && /^https?:/.test(url) ? url : null;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}
