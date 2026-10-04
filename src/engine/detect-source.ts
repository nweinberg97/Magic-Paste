import { isHardWrapped } from './parse-text';
import { looksLikeMarkdown } from './text';

export interface PastePayload {
  html?: string;
  text?: string;
}

export type SourceKind = 'empty' | 'html' | 'markdown' | 'text';

export interface SourceInfo {
  /** Which parser handles the payload. */
  kind: SourceKind;
  /** Human-readable guess at where the content came from. */
  label: string;
}

const HTML_ORIGINS: [RegExp, string][] = [
  [/docs-internal-guid/, 'Google Docs'],
  [/google-sheets-html-origin|ProgId content=Excel|x:str|<col\b/i, 'Spreadsheet'],
  [/urn:schemas-microsoft-com:office:word|class="?Mso/i, 'Microsoft Word'],
  [/data-message-author-role|class="[^"]*markdown prose|data-start="\d+"\s+data-end="\d+"/, 'AI chat'],
];

/** Tags that carry meaning. HTML made only of wrappers adds nothing over text/plain. */
const MEANINGFUL_TAG = /<(h[1-6]|ul|ol|li|table|a\s|b|strong|i|em|blockquote|pre|code|img|s|del|u)\b/i;

/**
 * Decide which representation to trust. Rich HTML usually wins, except when it
 * is a thin wrapper around text that is actually Markdown (common when copying
 * from code editors, terminals and some AI tools).
 */
export function detectSource(payload: PastePayload): SourceInfo {
  const html = payload.html?.trim() ?? '';
  const text = payload.text ?? '';

  if (html && /[^\s]/.test(html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ''))) {
    const thin = !MEANINGFUL_TAG.test(html);
    if (!(thin && text.trim() && looksLikeMarkdown(text))) {
      const origin = HTML_ORIGINS.find(([pattern]) => pattern.test(html));
      return { kind: 'html', label: origin?.[1] ?? 'Web page' };
    }
  }

  if (!text.trim()) return { kind: 'empty', label: 'Nothing' };
  if (looksLikeMarkdown(text)) return { kind: 'markdown', label: 'Markdown' };

  // Spreadsheet rows have tabs *between* values, not just leading indentation.
  const rows = text.split(/\r?\n/).filter((line) => /\S\t+\S/.test(line));
  if (rows.length >= 2) return { kind: 'text', label: 'Spreadsheet' };

  const chunks = text.split(/\n\s*\n/).map((chunk) => chunk.split('\n').map((line) => line.trim()));
  if (chunks.some((chunk) => chunk.length >= 3 && isHardWrapped(chunk))) return { kind: 'text', label: 'PDF text' };

  return { kind: 'text', label: 'Plain text' };
}
