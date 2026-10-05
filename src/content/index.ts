import { recordActivity } from '../extension/activity';
import { COPY_ORIGIN_KEY, fingerprint, matchOrigin, siteName, type CopyOrigin } from '../extension/origin';
import { loadSettings, onSettingsChanged, type Settings } from '../extension/settings';
import { learnStyle, mergeProfiles } from '../engine';
import { STYLES_KEY, loadStyles, saveStyle, styleScope, type SavedStyle } from '../extension/styles';
import { installPasteInterceptor } from './interceptor';
import { recordLastPaste } from '../extension/last-paste';
import { cleanedFeedback, skippedFeedback } from './feedback';
import { showToast } from './toast';

/** about:blank editor iframes (TinyMCE, Google Docs) inherit their parent's origin. */
function pageHostname(): string {
  try {
    return location.hostname || new URL(self.origin).hostname;
  } catch {
    return '';
  }
}

/** The page the user sees. Editor iframes (Google Docs) report about:blank themselves. */
function pageUrl(): string {
  try {
    return window.top?.location.href ?? location.href;
  } catch {
    return location.href;
  }
}

const hostname = pageHostname();
const scope = styleScope(pageUrl());
let styles: Record<string, SavedStyle> = {};
let settings: Settings | null = null;
let lastCopy: CopyOrigin | undefined;

loadSettings().then((loaded) => (settings = loaded), () => (settings = null));
onSettingsChanged((next) => (settings = next));

// Paste handlers must be synchronous, so the last copy origin is mirrored here.
chrome.storage.local.get(COPY_ORIGIN_KEY).then((stored) => (lastCopy = stored[COPY_ORIGIN_KEY] as CopyOrigin | undefined));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[COPY_ORIGIN_KEY]) lastCopy = changes[COPY_ORIGIN_KEY].newValue as CopyOrigin;
  if (changes[STYLES_KEY]) styles = (changes[STYLES_KEY].newValue as Record<string, SavedStyle>) ?? {};
});
loadStyles().then((loaded) => (styles = loaded), () => {});

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

// Google Docs hides its formatting from extensions, except on the clipboard.
// Copying inside a Doc teaches Magic Paste that document's design, so pastes
// into it can match without anyone pressing a button. This listener runs in
// the bubble phase, after Docs has put its HTML on the clipboard.
if (scope?.startsWith('gdoc:')) {
  window.addEventListener('copy', (event) => {
    try {
      const html = event.clipboardData?.getData('text/html') ?? '';
      if (!html.includes('docs-internal-guid')) return;
      const learned = learnStyle(html);
      if (!learned) return;
      const previous = styles[scope];
      const title = (() => {
        try {
          return window.top?.document.title.replace(/ - Google Docs$/, '') ?? '';
        } catch {
          return '';
        }
      })();
      saveStyle(scope, {
        profile: mergeProfiles(previous?.profile, learned),
        label: previous?.label ?? (title || 'this document'),
        learnedAt: Date.now(),
        auto: previous ? previous.auto : true,
      }).catch(() => {});
    } catch {
      // Learning is a bonus; never interfere with copying.
    }
  });
}

installPasteInterceptor(window, {
  hostname,
  getSettings: () => settings,
  getStyle: () => (scope ? styles[scope]?.profile : undefined),
  onPasted({ result, clipboardText, mode }) {
    const fixes = result.notes.filter((note) => note.id !== 'links').length;
    const source = matchOrigin(lastCopy, clipboardText) ?? result.source.label;
    const summary = `Cleaned for ${result.destination.label}: ${fixes} ${fixes === 1 ? 'fix' : 'fixes'}`;
    recordActivity({ source, destination: result.destination.label, fixes, at: Date.now() }).catch(() => {});
    recordLastPaste(hostname, { at: Date.now(), cleaned: true, summary }).catch(() => {});
    if (settings?.showConfirmation) showToast(cleanedFeedback(result, mode));
  },
  onSkip(reason, context) {
    const feedback = skippedFeedback(reason, context);
    if (!feedback) return;
    recordLastPaste(hostname, { at: Date.now(), cleaned: false, summary: `${feedback.title}: ${feedback.lines?.[0] ?? ''}` }).catch(() => {});
    if (settings?.showConfirmation) showToast(feedback);
  },
});
