/**
 * Naming where content was copied from.
 *
 * When the user copies on a page, the content script stores a fingerprint of
 * the selection (a hash, not the text) and the site's name. At paste time a
 * matching fingerprint lets the popup say "ChatGPT → Gmail" instead of
 * guessing from the content alone.
 */

export interface CopyOrigin {
  fingerprint: string;
  site: string;
  at: number;
}

export const COPY_ORIGIN_KEY = 'lastCopy';
const MAX_AGE_MS = 30 * 60 * 1000;

const SITE_NAMES: [RegExp, string][] = [
  [/(^|\.)chatgpt\.com$|^chat\.openai\.com$/, 'ChatGPT'],
  [/^claude\.ai$/, 'Claude'],
  [/^gemini\.google\.com$/, 'Gemini'],
  [/^docs\.google\.com$/, 'Google Docs'],
  [/^mail\.google\.com$/, 'Gmail'],
  [/(^|\.)slack\.com$/, 'Slack'],
  [/(^|\.)notion\.so$|\.notion\.site$/, 'Notion'],
  [/(^|\.)github\.com$/, 'GitHub'],
  [/(^|\.)wikipedia\.org$/, 'Wikipedia'],
  [/(^|\.)medium\.com$/, 'Medium'],
  [/(^|\.)stackoverflow\.com$/, 'Stack Overflow'],
];

export function siteName(hostname: string): string {
  const known = SITE_NAMES.find(([pattern]) => pattern.test(hostname));
  return known ? known[1] : hostname.replace(/^www\./, '') || 'Unknown';
}

/**
 * Selection text and clipboard text differ in whitespace and bullet glyphs
 * across browsers, so compare only letters and digits.
 */
export function fingerprint(value: string): string {
  const core = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 400);
  if (core.length < 3) return '';
  let hash = 5381;
  for (let i = 0; i < core.length; i++) hash = ((hash << 5) + hash + core.charCodeAt(i)) | 0;
  return `${core.length}:${(hash >>> 0).toString(36)}`;
}

export function matchOrigin(origin: CopyOrigin | undefined, pastedText: string, now = Date.now()): string | undefined {
  if (!origin || now - origin.at > MAX_AGE_MS) return undefined;
  const fp = fingerprint(pastedText);
  return fp && fp === origin.fingerprint ? origin.site : undefined;
}
