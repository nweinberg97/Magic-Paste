/**
 * The only UI Magic Paste shows inside pages: a small card after each paste
 * saying what happened, so it's always clear whether Magic Paste acted.
 *
 * Rendered in a closed shadow root (page CSS can't restyle it, and it can't
 * restyle the page), in the top-level document: editors like Google Docs
 * receive pastes in a hidden iframe, where a toast would never be seen.
 */

export type ToastTone = 'cleaned' | 'normal' | 'warning';

export interface ToastContent {
  tone: ToastTone;
  title: string;
  /** Right-aligned context, e.g. the destination ("Google Docs"). */
  meta?: string;
  /** What changed, or why nothing did. */
  lines?: string[];
  /** One follow-up action. `run` returns the line to show once it's done. */
  action?: { label: string; run: () => Promise<string> };
}

const DURATION: Record<ToastTone, number> = { cleaned: 3600, normal: 2600, warning: 7000 };
const MAX_LINES = 3;

const STYLE = `
  :host { all: initial; }
  .toast {
    position: fixed; z-index: 2147483647; box-sizing: border-box;
    width: max-content; max-width: min(340px, calc(100vw - 24px));
    padding: 10px 12px 11px; border-radius: 10px;
    background: #1c1b19; color: #f5f2ec;
    font: 13px/1.4 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    box-shadow: 0 10px 30px rgba(0,0,0,.22), 0 1px 3px rgba(0,0,0,.25);
    animation: enter .18s ease-out;
  }
  /* Never start invisible: if the page isn't animating, the toast must still show. */
  @keyframes enter { from { transform: translateY(6px); } to { transform: none; } }
  .toast.leaving { opacity: 0; transition: opacity .2s ease; }
  .head { display: flex; align-items: center; gap: 8px; }
  .mark { flex: none; width: 16px; text-align: center; font-size: 13px; line-height: 1; }
  .cleaned .mark { color: #ff8a5c; }
  .normal .mark { color: #a8a39a; }
  .warning .mark { color: #f5b041; }
  .title { font-weight: 600; }
  .meta { margin-left: auto; padding-left: 16px; color: #a8a39a; font-size: 12px; }
  .close { margin-left: 6px; padding: 0 2px; border: 0; background: none; color: #8c877e; font: inherit; font-size: 15px; line-height: 1; cursor: pointer; }
  .close:hover { color: #f5f2ec; }
  ul { margin: 6px 0 0; padding: 0 0 0 24px; list-style: none; color: #d6d1c7; font-size: 12.5px; }
  li { position: relative; margin-top: 2px; }
  .cleaned li::before { content: "✓"; position: absolute; left: -14px; color: #7fd1a0; font-size: 11px; }
  li.more { color: #8c877e; }
  li.more::before { content: none; }
  .action { margin: 9px 0 0 24px; padding: 5px 10px; border: 1px solid #4a4741; border-radius: 6px; background: #2a2926; color: #f5f2ec; font: 500 12.5px/1.2 inherit; font-family: inherit; cursor: pointer; }
  .action:hover { border-color: #8c877e; }
  .done { margin: 8px 0 0 24px; color: #7fd1a0; font-size: 12.5px; }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
`;

const MARKS: Record<ToastTone, string> = { cleaned: '✦', normal: '•', warning: '!' };

let hideTimer: number | undefined;

function topDocument(): Document {
  try {
    return window.top?.document ?? document;
  } catch {
    return document; // cross-origin frame: show it where we are
  }
}

export function showToast(content: ToastContent): void {
  const doc = topDocument();
  const view = doc.defaultView ?? window;
  doc.getElementById('magic-paste-toast')?.remove();
  view.clearTimeout(hideTimer);

  const host = doc.createElement('div');
  host.id = 'magic-paste-toast';
  host.dataset.tone = content.tone;
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = STYLE;

  const toast = doc.createElement('div');
  toast.className = `toast ${content.tone}`;
  toast.setAttribute('role', 'status');
  const head = doc.createElement('div');
  head.className = 'head';
  const mark = Object.assign(doc.createElement('span'), { className: 'mark', textContent: MARKS[content.tone] });
  const title = Object.assign(doc.createElement('span'), { className: 'title', textContent: content.title });
  head.append(mark, title);
  if (content.meta) head.append(Object.assign(doc.createElement('span'), { className: 'meta', textContent: content.meta }));
  const close = Object.assign(doc.createElement('button'), { className: 'close', textContent: '×', title: 'Dismiss' });
  close.setAttribute('aria-label', 'Dismiss');
  head.append(close);
  toast.append(head);

  const lines = content.lines ?? [];
  if (lines.length) {
    const list = doc.createElement('ul');
    const shown = lines.length > MAX_LINES + 1 ? lines.slice(0, MAX_LINES) : lines;
    for (const line of shown) list.append(Object.assign(doc.createElement('li'), { textContent: line }));
    if (shown.length < lines.length) list.append(Object.assign(doc.createElement('li'), { className: 'more', textContent: `+ ${lines.length - shown.length} more` }));
    toast.append(list);
  }
  if (content.action) {
    const { label, run } = content.action;
    const button = Object.assign(doc.createElement('button'), { className: 'action', textContent: label });
    button.addEventListener('click', async () => {
      button.disabled = true;
      let message: string;
      try {
        message = await run();
      } catch {
        message = 'Couldn’t reach the clipboard. Use Clean clipboard in the Magic Paste menu instead.';
      }
      button.replaceWith(Object.assign(doc.createElement('div'), { className: 'done', textContent: message }));
      schedule();
    });
    toast.append(button);
  }
  root.append(style, toast);
  doc.documentElement.append(host);

  // Bottom-right of the window: consistent, and it never covers the text just pasted or buttons like Send.
  toast.style.right = '16px';
  toast.style.bottom = '16px';

  const hide = () => {
    toast.classList.add('leaving');
    view.setTimeout(() => host.remove(), 220);
  };
  const schedule = () => {
    view.clearTimeout(hideTimer);
    hideTimer = view.setTimeout(hide, DURATION[content.tone]);
  };
  toast.addEventListener('mouseenter', () => view.clearTimeout(hideTimer));
  toast.addEventListener('mouseleave', schedule);
  close.addEventListener('click', hide);
  schedule();
}
