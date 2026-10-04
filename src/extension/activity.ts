/**
 * A tiny local history for the popup ("ChatGPT → Gmail · 4 fixes").
 * Only labels and counts are stored, never the pasted content.
 */

export interface ActivityEntry {
  source: string;
  destination: string;
  fixes: number;
  at: number;
}

const KEY = 'activity';
const LIMIT = 5;

export async function loadActivity(): Promise<ActivityEntry[]> {
  const stored = await chrome.storage.local.get(KEY);
  return Array.isArray(stored[KEY]) ? (stored[KEY] as ActivityEntry[]) : [];
}

export async function recordActivity(entry: ActivityEntry): Promise<void> {
  const history = await loadActivity();
  await chrome.storage.local.set({ [KEY]: [entry, ...history].slice(0, LIMIT) });
}
