import { ADAPTERS, describeProfile, destinationForHost, learnStyle, transform, type DestinationId } from '../engine';
import { loadActivity, type ActivityEntry } from '../extension/activity';
import { loadSettings, updateSettings, type Settings } from '../extension/settings';
import { loadLastPastes } from '../extension/last-paste';
import { forgetStyle, loadStyles, saveStyle, styleScope, type SavedStyle } from '../extension/styles';
import { modKey, readClipboard, writeClipboard } from '../ui/clipboard';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings;
let hostname = '';
let scope: string | null = null;
let pageTitle = '';
let savedStyle: SavedStyle | undefined;

async function init(): Promise<void> {
  document.querySelectorAll('[data-mod-key]').forEach((el) => (el.textContent = modKey));
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;

  const [loaded, [tab]] = await Promise.all([loadSettings(), chrome.tabs.query({ active: true, currentWindow: true })]);
  settings = loaded;
  hostname = webHostname(tab?.url);
  scope = styleScope(tab?.url);
  pageTitle = (tab?.title ?? '').replace(/ - Google Docs$/, '').trim() || hostname;
  savedStyle = scope ? (await loadStyles())[scope] : undefined;

  bindSettings();
  renderPower();
  renderSite();
  setupStyle();
  setupClipboard();
  renderActivity(await loadActivity());
  renderLastPaste();

  for (const [id, page] of [['open-playground', 'playground.html'], ['open-testkit', 'testkit.html']]) {
    $(id).addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL(page) });
      window.close();
    });
  }
}

function webHostname(url: string | undefined): string {
  try {
    const parsed = new URL(url ?? '');
    return /^https?:$/.test(parsed.protocol) ? parsed.hostname : '';
  } catch {
    return '';
  }
}

async function save(patch: Partial<Settings>): Promise<void> {
  settings = await updateSettings(patch);
  renderPower();
  renderSite();
}

function bindSettings(): void {
  const power = $<HTMLInputElement>('enabled');
  power.checked = settings.enabled;
  power.addEventListener('change', () => save({ enabled: power.checked }));

  document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
    const key = input.dataset.setting as keyof Settings;
    input.checked = settings[key] as boolean;
    input.addEventListener('change', () => save({ [key]: input.checked }));
  });
}

function renderPower(): void {
  document.body.classList.toggle('off', !settings.enabled);
  $('state').textContent = settings.enabled ? 'On' : 'Off';
}

function renderSite(): void {
  const site = $('site');
  const text = $('site-text');
  const action = $<HTMLButtonElement>('site-action');
  site.hidden = false;
  site.className = 'site';
  action.hidden = true;

  if (!hostname) {
    site.classList.add('muted');
    text.textContent = 'Chrome doesn’t let extensions run on this page.';
    return;
  }

  const paused = settings.pausedSites.includes(hostname);
  const destination = destinationForHost(hostname);
  action.hidden = !settings.enabled;
  action.textContent = paused ? 'Resume' : 'Pause here';
  action.onclick = () =>
    save({ pausedSites: paused ? settings.pausedSites.filter((h) => h !== hostname) : [...settings.pausedSites, hostname] });

  if (!settings.enabled) {
    site.classList.add('muted');
    text.textContent = 'Paste works normally while Magic Paste is off.';
  } else if (paused) {
    site.classList.add('muted');
    text.innerHTML = `Paused on <b></b>`;
    text.querySelector('b')!.textContent = hostname;
  } else {
    const label = settings.destinationAware ? destination.label : ADAPTERS.rich.label;
    text.innerHTML = `Formatting for <b></b> on this site`;
    text.querySelector('b')!.textContent = label;
  }
}

function setupStyle(): void {
  const block = $('style-block');
  const status = $('style-status');
  const learn = $<HTMLButtonElement>('style-learn');
  const forget = $<HTMLButtonElement>('style-forget');
  block.hidden = !scope;
  if (!scope) return;

  const show = (message?: string, tone: 'ok' | 'error' | '' = '') => {
    learn.textContent = savedStyle ? 'Relearn' : 'Learn this style';
    forget.hidden = !savedStyle;
    status.className = `hint ${tone}`;
    if (message) status.textContent = message;
    else if (savedStyle) status.textContent = `Pastes here match “${savedStyle.label}”. ${describeProfile(savedStyle.profile)}`;
    else status.textContent = 'Make pastes match this document: copy a section of it (a heading, an entry, a few bullets), then click Learn this style.';
  };

  learn.addEventListener('click', async () => {
    try {
      const { html } = await readClipboard();
      if (!html) return show('Copy straight from the document, so its formatting comes along, then try again.', 'error');
      const profile = learnStyle(html);
      if (!profile) return show('Couldn’t find styled text in what you copied. Try a bigger section.', 'error');
      savedStyle = { profile, label: pageTitle, learnedAt: Date.now() };
      await saveStyle(scope!, savedStyle);
      show(`${describeProfile(profile)} Pastes here now match it.`, 'ok');
    } catch {
      show('Chrome blocked clipboard access. Click again, or allow clipboard access for Magic Paste.', 'error');
    }
  });
  forget.addEventListener('click', async () => {
    await forgetStyle(scope!);
    savedStyle = undefined;
    show();
  });
  show();
}

function setupClipboard(): void {
  const select = $<HTMLSelectElement>('clip-destination');
  for (const adapter of Object.values(ADAPTERS)) select.add(new Option(adapter.label, adapter.id));
  select.value = hostname ? destinationForHost(hostname).id : 'rich';

  const status = $('clip-status');
  const report = (message: string, tone: 'ok' | 'error' | '' = '') => {
    status.textContent = message;
    status.className = `hint ${tone}`;
  };

  $('clip-clean').addEventListener('click', async () => {
    try {
      const payload = await readClipboard();
      const result = transform(payload, { destination: select.value as DestinationId, settings, style: savedStyle?.profile });
      if (!result.ok) {
        report(result.reason === 'empty' ? 'Your clipboard is empty. Copy something first.' : 'Couldn’t read that content. Your clipboard is unchanged.', 'error');
        return;
      }
      if (!result.changed) {
        report('Already clean. Nothing to fix.', 'ok');
        return;
      }
      await writeClipboard(result.text, result.html);
      const fixes = result.notes.filter((n) => n.id !== 'links').length;
      report(`Cleaned for ${result.destination.label} · ${fixes} ${fixes === 1 ? 'fix' : 'fixes'}. Paste with ${modKey}.`, 'ok');
    } catch {
      report('Chrome blocked clipboard access. Click Clean again, or allow clipboard access for Magic Paste.', 'error');
    }
  });
}

/** "Did that work?" — the outcome of the last paste on this site. */
async function renderLastPaste(): Promise<void> {
  const el = $('last-paste');
  const last = hostname ? (await loadLastPastes())[hostname] : undefined;
  el.hidden = !last;
  if (!last) return;
  el.className = `last-paste ${last.cleaned ? 'ok' : 'skipped'}`;
  const when = ago(last.at);
  el.textContent = `Last paste here (${when === 'now' ? 'just now' : `${when} ago`}): ${last.summary}`;
}

function renderActivity(entries: ActivityEntry[]): void {
  const list = $('activity');
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Nothing yet. Paste somewhere and it shows up here.';
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    const li = document.createElement('li');
    const route = document.createElement('span');
    route.className = 'route';
    route.append(entry.source, Object.assign(document.createElement('span'), { className: 'arrow', textContent: '→' }), entry.destination);
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${entry.fixes} ${entry.fixes === 1 ? 'fix' : 'fixes'} · ${ago(entry.at)}`;
    li.append(route, meta);
    list.append(li);
  }
}

function ago(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

init();
