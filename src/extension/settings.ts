import { DEFAULT_FORMAT, type FormatSettings } from '../engine';

export interface Settings extends FormatSettings {
  enabled: boolean;
  destinationAware: boolean;
  showConfirmation: boolean;
  /** Hostnames where the user paused Magic Paste. */
  pausedSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_FORMAT,
  enabled: true,
  destinationAware: true,
  showConfirmation: true,
  pausedSites: [],
};

const KEY = 'settings';

export function withDefaults(stored: unknown): Settings {
  return { ...DEFAULT_SETTINGS, ...(typeof stored === 'object' && stored ? (stored as Partial<Settings>) : {}) };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(KEY);
  return withDefaults(stored[KEY]);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(callback: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[KEY]) callback(withDefaults(changes[KEY].newValue));
  });
}

export function isActiveOn(settings: Settings, hostname: string): boolean {
  return settings.enabled && !settings.pausedSites.includes(hostname);
}
