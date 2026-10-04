import { installPasteInterceptor, type SkipReason } from '../content/interceptor';
import { showToast } from '../content/toast';
import { ADAPTERS, transform, type DestinationId, type PastePayload, type TransformResult } from '../engine';
import { DEFAULT_SETTINGS } from '../extension/settings';
import { modKey, writeClipboard } from '../ui/clipboard';
import { SAMPLES, type Sample } from './samples';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const ORDER: DestinationId[] = ['google-docs', 'gmail', 'slack', 'notion', 'rich', 'plain'];

const state = {
  payload: {} as PastePayload,
  sample: undefined as Sample | undefined,
  destination: 'gmail' as DestinationId,
  view: 'preview' as 'preview' | 'source',
  result: undefined as TransformResult | undefined,
  liveEnabled: true,
};

// ---------------------------------------------------------------------------
// Input

function renderCases(): void {
  const list = $('cases');
  list.replaceChildren(
    ...SAMPLES.map((sample) => {
      const button = el('button', 'case');
      button.dataset.id = sample.id;
      button.append(el('span', 'case-from', sample.from), el('span', 'case-arrow', '→'), el('span', 'case-to', sample.to));
      button.addEventListener('click', () => loadSample(sample));
      return button;
    }),
  );
}

function loadSample(sample: Sample): void {
  state.sample = sample;
  state.payload = { ...sample.payload, text: sample.payload.text ?? visibleText(sample.payload.html ?? '') };
  state.destination = sample.destination;
  $<HTMLTextAreaElement>('input').value = state.payload.text ?? '';
  update();
}

/** The text/plain twin a browser would put on the clipboard. Only used for the built-in (trusted) samples. */
function visibleText(html: string): string {
  const box = el('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px';
  box.innerHTML = html;
  document.body.append(box);
  const text = box.innerText;
  box.remove();
  return text;
}

function bindInput(): void {
  const input = $<HTMLTextAreaElement>('input');
  input.addEventListener('paste', (event) => {
    const data = event.clipboardData;
    if (!data) return;
    event.preventDefault();
    state.sample = undefined;
    state.payload = { html: data.getData('text/html') || undefined, text: data.getData('text/plain') };
    input.value = state.payload.text ?? '';
    update();
  });
  input.addEventListener('input', () => {
    // Once the text is edited, the HTML no longer describes it.
    state.payload = { text: input.value };
    state.sample = undefined;
    update();
  });
  $('clear').addEventListener('click', () => {
    state.payload = {};
    state.sample = undefined;
    input.value = '';
    input.focus();
    update();
  });
  $('drop-html').addEventListener('click', () => {
    state.payload = { text: state.payload.text };
    update();
  });
  $('toggle-source').addEventListener('click', () => {
    const source = $('html-source');
    source.hidden = !source.hidden;
    $('toggle-source').textContent = source.hidden ? 'View HTML' : 'Hide HTML';
  });
}

// ---------------------------------------------------------------------------
// Destination + view controls

function renderDestinations(): void {
  const picker = $('destinations');
  picker.replaceChildren(
    ...ORDER.map((id) => {
      const button = el('button', '', ADAPTERS[id].label);
      button.setAttribute('role', 'radio');
      button.dataset.destination = id;
      button.addEventListener('click', () => {
        state.destination = id;
        update();
      });
      return button;
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) =>
    button.addEventListener('click', () => {
      state.view = button.dataset.view as 'preview' | 'source';
      update();
    }),
  );
}

// ---------------------------------------------------------------------------
// Rendering

function update(): void {
  const { payload, destination } = state;
  const hasInput = !!(payload.html || payload.text?.trim());
  state.result = hasInput ? transform(payload, { destination, settings: DEFAULT_SETTINGS }) : undefined;

  document.querySelectorAll<HTMLElement>('.case').forEach((c) => c.classList.toggle('active', c.dataset.id === state.sample?.id));
  document.querySelectorAll<HTMLElement>('[data-destination]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.destination === destination)));
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === state.view)));

  $('problem').textContent = state.sample?.problem ?? '';
  const chip = $('source-chip');
  chip.textContent = state.result?.ok ? state.result.source.label : '';
  chip.hidden = !chip.textContent;

  const htmlBar = $('html-bar');
  htmlBar.hidden = !payload.html;
  if (payload.html) {
    $('html-size').textContent = `Rich HTML on clipboard · ${(payload.html.length / 1024).toFixed(1)} KB`;
    $('html-source').textContent = payload.html;
  } else {
    $('html-source').hidden = true;
    $('toggle-source').textContent = 'View HTML';
  }

  renderBefore();
  renderAfter();
  renderChanges();
  renderLive();
}

function frame(target: HTMLElement, body: Node): void {
  const id = state.destination;
  target.className = `frame frame-${id}`;
  const parts: Node[] = [];
  if (id === 'gmail') {
    const head = el('div', 'mail-head');
    head.append(field('To', 'team@company.com'), field('Subject', 'Quick update'));
    parts.push(head);
  }
  const content = el('div', 'frame-body');
  content.append(body);
  parts.push(content);
  if (id === 'slack') parts.push(el('div', 'slack-bar', 'Message #launch-team'));
  target.replaceChildren(...parts);
}

function field(label: string, value: string): HTMLElement {
  const row = el('div', 'mail-field');
  row.append(el('span', '', label), el('span', '', value));
  return row;
}

function emptyState(message: string): HTMLElement {
  return el('div', 'empty', message);
}

function renderBefore(): void {
  const target = $('before');
  const { html, text } = state.payload;
  if (!html && !text?.trim()) return frame(target, emptyState('Pick a case above, or paste into the clipboard panel.'));

  // A plain-text field only ever receives text/plain; rich editors get the HTML.
  if (html && state.destination !== 'plain') {
    const iframe = el('iframe', 'source-frame');
    iframe.setAttribute('sandbox', 'allow-same-origin'); // no scripts; same-origin only so we can measure height
    iframe.setAttribute('title', 'Copied HTML as it would paste');
    iframe.srcdoc = `<!doctype html><style>html,body{margin:0;background:transparent}body{padding:2px 0;font:${frameFont()};color:#222;overflow:hidden}</style>${html}`;
    iframe.addEventListener('load', () => {
      const doc = iframe.contentDocument;
      if (doc) iframe.style.height = `${doc.documentElement.scrollHeight + 4}px`;
    });
    return frame(target, iframe);
  }
  frame(target, el('div', 'raw', text ?? ''));
}

function frameFont(): string {
  switch (state.destination) {
    case 'google-docs':
      return '11pt/1.5 Arial, sans-serif';
    case 'gmail':
      return '14px/1.5 Arial, Helvetica, sans-serif';
    default:
      return '15px/1.55 system-ui, sans-serif';
  }
}

function renderAfter(): void {
  const target = $('after');
  const result = state.result;
  const copy = $<HTMLButtonElement>('copy');
  copy.disabled = !result?.ok;

  if (!result) return frame(target, emptyState('The cleaned result appears here.'));
  if (!result.ok) {
    const messages = {
      empty: 'Nothing to paste.',
      'too-large': 'Too large to clean safely. Magic Paste would let this paste through untouched.',
      unsupported: 'Nothing Magic Paste can improve here. It would let this paste through untouched.',
      error: 'Something went wrong. Magic Paste would fall back to a normal paste.',
    };
    return frame(target, emptyState(messages[result.reason]));
  }

  if (state.view === 'source') {
    const wrap = el('div', 'source-view');
    if (result.html) wrap.append(el('div', 'source-label', 'text/html'), el('pre', 'code', prettyHtml(result.html)));
    wrap.append(el('div', 'source-label', 'text/plain'), el('pre', 'code', result.text));
    return frame(target, wrap);
  }

  if (result.destination.mode === 'plain' || !result.html) return frame(target, el('div', 'raw plain-out', result.text));
  const doc = el('div', 'doc');
  // Safe: renderer output is allowlisted tags with escaped text and vetted URLs.
  doc.innerHTML = result.html;
  frame(target, doc);
}

function prettyHtml(html: string): string {
  return html.replace(/(<\/(p|div|h[1-6]|li|ul|ol|blockquote|pre|tr|table|thead|tbody)>)/g, '$1\n').replace(/(<(ul|ol|table|thead|tbody|tr)( [^>]*)?>)/g, '$1\n');
}

function renderChanges(): void {
  const list = $('notes');
  const trace = $('trace');
  const result = state.result;
  list.replaceChildren();
  trace.textContent = '';
  if (!result?.ok) return;

  if (!result.changed) {
    list.append(el('li', 'note-quiet', 'Already clean. Magic Paste would let this paste through untouched.'));
  } else {
    for (const note of result.notes) list.append(el('li', '', note.message));
  }
  const delivery = result.destination.delivery === 'clipboard' ? ' · delivered via Clean clipboard' : '';
  trace.textContent = `Read as ${result.source.label} → formatted for ${result.destination.label} in ${result.ms.toFixed(1)} ms${delivery}`;
}

// ---------------------------------------------------------------------------
// Live interceptor demo

const SKIP_MESSAGES: Partial<Record<SkipReason, string>> = {
  'nothing-to-fix': 'Already clean, so Magic Paste stepped aside and the browser pasted normally.',
  'plain-paste-shortcut': 'Shift+paste is your “paste as plain text”. Magic Paste respects it.',
  'clipboard-only-destination': 'Google Docs owns its paste, so the extension never intercepts there. This was a normal paste.',
  'transform-failed': 'Nothing Magic Paste could improve. Normal paste.',
  files: 'Files and images pass through untouched.',
  disabled: 'Magic Paste is off: this was a normal browser paste.',
};

function renderLive(): void {
  const destination = ADAPTERS[state.destination];
  const plain = destination.mode === 'plain';
  const editor = $('live-editor');
  const textarea = $<HTMLTextAreaElement>('live-plain');
  editor.hidden = plain;
  textarea.hidden = !plain;
  editor.dataset.magicPasteDestination = destination.id;
  textarea.dataset.magicPasteDestination = destination.id;
  editor.className = `live-editor doc frame-${destination.id}`;
  $('live-dest').textContent = `Destination: ${destination.label}`;
}

function setupLive(): void {
  const note = $('live-note');
  const inLive = () => !!document.activeElement?.closest('.live-box');
  installPasteInterceptor(window, {
    hostname: 'playground',
    getSettings: () => ({ ...DEFAULT_SETTINGS, enabled: state.liveEnabled }),
    onPasted({ result, element }) {
      const fixes = result.notes.filter((n) => n.id !== 'links').length;
      showToast(element, `${result.destination.label} · ${fixes} ${fixes === 1 ? 'fix' : 'fixes'}`);
      note.textContent = result.notes.map((n) => n.message).join(' · ');
    },
    onSkip(reason) {
      if (inLive()) note.textContent = SKIP_MESSAGES[reason] ?? '';
    },
  });
  $<HTMLInputElement>('live-enabled').addEventListener('change', (event) => {
    state.liveEnabled = (event.target as HTMLInputElement).checked;
    note.textContent = state.liveEnabled ? '' : 'Off: paste here to see what the browser does on its own.';
  });
  $('live-clear').addEventListener('click', () => {
    $('live-editor').replaceChildren();
    $<HTMLTextAreaElement>('live-plain').value = '';
    note.textContent = '';
  });
}

// ---------------------------------------------------------------------------

function setupCopy(): void {
  const button = $<HTMLButtonElement>('copy');
  button.addEventListener('click', async () => {
    const result = state.result;
    if (!result?.ok) return;
    try {
      await writeClipboard(result.text, result.html);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Clipboard blocked';
    }
    setTimeout(() => (button.textContent = 'Copy result'), 1500);
  });
}

document.querySelectorAll('[data-mod-key]').forEach((node) => (node.textContent = modKey));
$('welcome').hidden = !new URLSearchParams(location.search).has('welcome');
renderCases();
renderDestinations();
bindInput();
setupCopy();
setupLive();
loadSample(SAMPLES[0]);
