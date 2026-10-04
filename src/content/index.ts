import { recordActivity } from '../extension/activity';
import { COPY_ORIGIN_KEY, fingerprint, matchOrigin, siteName, type CopyOrigin } from '../extension/origin';
import { loadSettings, onSettingsChanged, type Settings } from '../extension/settings';
import { installPasteInterceptor } from './interceptor';
import { showToast } from './toast';

/** about:blank editor iframes (TinyMCE, Google Docs) inherit their parent's origin. */
function pageHostname(): string {
  try {
    return location.hostname || new URL(self.origin).hostname;
  } catch {
    return '';
  }
}

const hostname = pageHostname();
let settings: Settings | null = null;
let lastCopy: CopyOrigin | undefined;

loadSettings().then((loaded) => (settings = loaded), () => (settings = null));
onSettingsChanged((next) => (settings = next));

// Paste handlers must be synchronous, so the last copy origin is mirrored here.
chrome.storage.local.get(COPY_ORIGIN_KEY).then((stored) => (lastCopy = stored[COPY_ORIGIN_KEY] as CopyOrigin | undefined));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[COPY_ORIGIN_KEY]) lastCopy = changes[COPY_ORIGIN_KEY].newValue as CopyOrigin;
});

const rememberCopy = () => {
  const active = document.activeElement;
  const text =
    active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement
      ? active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0)
      : (window.getSelection()?.toString() ?? '');
  const print = fingerprint(text);
  if (!print) return;
  const origin: CopyOrigin = { fingerprint: print, site: siteName(hostname), at: Date.now() };
  lastCopy = origin;
  chrome.storage.local.set({ [COPY_ORIGIN_KEY]: origin }).catch(() => {});
};
document.addEventListener('copy', rememberCopy, true);
document.addEventListener('cut', rememberCopy, true);

installPasteInterceptor(window, {
  hostname,
  getSettings: () => settings,
  onPasted({ result, element, clipboardText }) {
    const fixes = result.notes.filter((note) => note.id !== 'links').length;
    const source = matchOrigin(lastCopy, clipboardText) ?? result.source.label;
    recordActivity({ source, destination: result.destination.label, fixes, at: Date.now() }).catch(() => {});
    if (settings?.showConfirmation) showToast(element, `${result.destination.label} · ${fixes} ${fixes === 1 ? 'fix' : 'fixes'}`);
  },
});
