import { DESTINATIONS, SPECIMENS, type Specimen } from './specimens';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

type Mark = '' | 'pass' | 'fail';
interface Result {
  mark: Mark;
  note: string;
}

const STORE = 'magic-paste-testkit';
let results: Record<string, Result> = load();

function load(): Record<string, Result> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, Result>;
  } catch {
    return {};
  }
}

function save(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(results));
  } catch {
    // Storage unavailable (private window): results last for this visit.
  }
}

const key = (specimen: string, destination: string) => `${specimen}::${destination}`;

// ---------------------------------------------------------------------------

/** The raw clipboard, exactly as a site would produce it. Deliberately not marked as cleaned. */
async function copyExactly(specimen: Specimen): Promise<void> {
  const parts: Record<string, Blob> = { 'text/plain': new Blob([specimen.text], { type: 'text/plain' }) };
  if (specimen.html) parts['text/html'] = new Blob([specimen.html], { type: 'text/html' });
  await navigator.clipboard.write([new ClipboardItem(parts)]);
}

function preview(specimen: Specimen): HTMLElement {
  if (!specimen.html || specimen.codeOnly) {
    const pre = el('pre', 'specimen-text', specimen.codeOnly ? specimen.html : specimen.text);
    if (specimen.id === 'huge') pre.textContent = `${specimen.text.split('\n').slice(0, 12).join('\n')}\n… (${specimen.text.split('\n').length.toLocaleString()} lines; use Copy exactly)`;
    return pre;
  }
  // Rendered in a script-free frame, so you can also select and copy it the way you would on a real site.
  const frame = el('iframe', 'specimen-frame');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('title', specimen.title);
  frame.srcdoc = `<!doctype html><style>body{margin:14px;font:15px/1.5 system-ui,sans-serif;color:#222;background:#fff}img{max-width:100%;height:auto}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style>${specimen.html}`;
  frame.addEventListener('load', () => {
    const height = frame.contentDocument?.documentElement.scrollHeight ?? 200;
    frame.style.height = `${Math.min(height + 4, 360)}px`;
  });
  return frame;
}

function renderSpecimens(): void {
  $('specimens').replaceChildren(
    ...SPECIMENS.map((specimen, index) => {
      const card = el('article', 'specimen');
      card.id = specimen.id;

      const head = el('div', 'specimen-head');
      head.append(el('span', 'num', String(index + 1).padStart(2, '0')));
      const titles = el('div', 'titles');
      titles.append(el('h2', '', specimen.title), el('p', 'from', specimen.from));
      head.append(titles);
      const copy = el('button', 'btn btn-primary', 'Copy exactly');
      copy.addEventListener('click', async () => {
        try {
          await copyExactly(specimen);
          copy.textContent = 'Copied';
        } catch {
          copy.textContent = 'Clipboard blocked';
        }
        setTimeout(() => (copy.textContent = 'Copy exactly'), 1400);
      });
      head.append(copy);

      const watch = el('p', 'watch');
      watch.append(el('b', '', 'Watch for: '), specimen.watch);

      const expect = el('dl', 'expect');
      expect.append(el('dt', '', 'Into a page with formatting'), el('dd', '', specimen.expect.formatted));
      expect.append(el('dt', '', 'Into a blank page'), el('dd', '', specimen.expect.blank));

      card.append(head, watch, preview(specimen), expect);
      return card;
    }),
  );
}

function renderResults(): void {
  const table = $<HTMLTableElement>('results-table');
  const head = el('thead');
  const headRow = el('tr');
  headRow.append(el('th', '', 'Specimen'), ...DESTINATIONS.map((d) => el('th', '', d)));
  head.append(headRow);

  const body = el('tbody');
  for (const specimen of SPECIMENS) {
    const row = el('tr');
    const name = el('td', 'name');
    const link = el('a', '', specimen.title);
    link.href = `#${specimen.id}`;
    name.append(link);
    row.append(name);
    for (const destination of DESTINATIONS) {
      const k = key(specimen.id, destination);
      const result = results[k] ?? { mark: '', note: '' };
      const cell = el('td', `cell ${result.mark}`);
      const select = el('select');
      select.setAttribute('aria-label', `${specimen.title} in ${destination}`);
      for (const [value, label] of [['', '–'], ['pass', '✓'], ['fail', '✗']] as const) select.add(new Option(label, value, false, result.mark === value));
      const note = el('input');
      note.placeholder = 'note';
      note.value = result.note;
      note.hidden = result.mark !== 'fail';
      const update = () => {
        results[k] = { mark: select.value as Mark, note: note.value };
        cell.className = `cell ${select.value}`;
        note.hidden = select.value !== 'fail';
        save();
        tally();
      };
      select.addEventListener('change', update);
      note.addEventListener('input', update);
      cell.append(select, note);
      row.append(cell);
    }
    body.append(row);
  }
  table.replaceChildren(head, body);
  tally();
}

function tally(): void {
  const values = Object.values(results);
  const pass = values.filter((r) => r.mark === 'pass').length;
  const fail = values.filter((r) => r.mark === 'fail').length;
  $('tally').textContent = `${pass} ✓ · ${fail} ✗ · ${SPECIMENS.length * DESTINATIONS.length - pass - fail} not tested`;
}

function resultsAsMarkdown(): string {
  const symbol = (r?: Result) => (r?.mark === 'pass' ? '✓' : r?.mark === 'fail' ? `✗ ${r.note}`.trim() : '–');
  const lines = [
    `| Specimen | ${DESTINATIONS.join(' | ')} |`,
    `| --- | ${DESTINATIONS.map(() => '---').join(' | ')} |`,
    ...SPECIMENS.map((s) => `| ${s.title} | ${DESTINATIONS.map((d) => symbol(results[key(s.id, d)]).replace(/\|/g, '/')).join(' | ')} |`),
  ];
  return `Magic Paste test results\n\n${lines.join('\n')}`;
}

$('copy-results').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('copy-results');
  try {
    await navigator.clipboard.writeText(resultsAsMarkdown());
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Clipboard blocked';
  }
  setTimeout(() => (button.textContent = 'Copy results'), 1400);
});
$('reset').addEventListener('click', () => {
  if (!confirm('Clear all marks?')) return;
  results = {};
  save();
  renderResults();
});

renderSpecimens();
renderResults();
