/**
 * The outcome of the most recent paste on each site, so the popup can answer
 * "did that work?" after the fact. Only outcomes are stored, never content.
 */

export interface LastPaste {
  at: number;
  cleaned: boolean;
  /** One line, e.g. "Cleaned for Google Docs: 4 fixes" or "Not cleaned: Google Docs didn’t accept…". */
  summary: string;
}

export const LAST_PASTE_KEY = 'lastPaste';

export async function loadLastPastes(): Promise<Record<string, LastPaste>> {
  const stored = await chrome.storage.local.get(LAST_PASTE_KEY);
  const value = stored[LAST_PASTE_KEY];
  return typeof value === 'object' && value ? (value as Record<string, LastPaste>) : {};
}

export async function recordLastPaste(hostname: string, paste: LastPaste): Promise<void> {
  const all = await loadLastPastes();
  // Keep the map small: the 20 most recent sites.
  const entries = Object.entries({ ...all, [hostname]: paste })
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, 20);
  await chrome.storage.local.set({ [LAST_PASTE_KEY]: Object.fromEntries(entries) });
}
