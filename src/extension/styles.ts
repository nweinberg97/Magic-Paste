import type { StyleProfile } from '../engine';

/**
 * Learned document styles, one per destination document. A Google Doc is
 * identified by its document id, anything else by its site, so a style
 * learned from your resume applies to your resume and nowhere else.
 */

export interface SavedStyle {
  profile: StyleProfile;
  /** What the user calls it: the document's title. */
  label: string;
  learnedAt: number;
  /** Learned in the background from copies made inside the document. */
  auto?: boolean;
}

export const STYLES_KEY = 'documentStyles';

export function styleScope(url: string | undefined): string | null {
  try {
    const parsed = new URL(url ?? '');
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const doc = /^\/document\/(?:u\/\d+\/)?d\/([\w-]{10,})/.exec(parsed.pathname);
    if (parsed.hostname === 'docs.google.com' && doc) return `gdoc:${doc[1]}`;
    return `site:${parsed.hostname}`;
  } catch {
    return null;
  }
}

export async function loadStyles(): Promise<Record<string, SavedStyle>> {
  const stored = await chrome.storage.local.get(STYLES_KEY);
  const value = stored[STYLES_KEY];
  return typeof value === 'object' && value ? (value as Record<string, SavedStyle>) : {};
}

export async function saveStyle(scope: string, style: SavedStyle): Promise<void> {
  await chrome.storage.local.set({ [STYLES_KEY]: { ...(await loadStyles()), [scope]: style } });
}

export async function forgetStyle(scope: string): Promise<void> {
  const styles = await loadStyles();
  delete styles[scope];
  await chrome.storage.local.set({ [STYLES_KEY]: styles });
}
