/**
 * The only UI Magic Paste shows inside pages: a small pill near the field
 * that fades out on its own. Rendered in a closed shadow root so page CSS
 * can't restyle it and it can't restyle the page.
 */

const STYLE = `
  :host { all: initial; }
  .toast {
    position: fixed; z-index: 2147483647; pointer-events: none;
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 12px 7px 10px; border-radius: 999px;
    background: #1c1b19; color: #f5f2ec;
    font: 500 12.5px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    letter-spacing: 0.005em; box-shadow: 0 6px 24px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.2);
    opacity: 0; transform: translateY(4px);
    transition: opacity .18s ease, transform .18s ease;
  }
  .toast.show { opacity: 1; transform: none; }
  .spark { color: #ff8a5c; font-size: 13px; }
  .detail { color: #a8a39a; font-weight: 400; }
  @media (prefers-reduced-motion: reduce) { .toast { transition: none; transform: none; } }
`;

let timer: number | undefined;

export function showToast(near: Element, detail: string): void {
  document.getElementById('magic-paste-toast')?.remove();
  window.clearTimeout(timer);

  const host = document.createElement('div');
  host.id = 'magic-paste-toast';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${STYLE}</style><div class="toast" role="status"><span class="spark">✦</span><span>Pasted cleanly</span><span class="detail"></span></div>`;
  const toast = root.querySelector<HTMLElement>('.toast')!;
  root.querySelector('.detail')!.textContent = detail;
  document.documentElement.append(host);

  // Sit just below the field, or at the bottom of the viewport if it's off-screen.
  const rect = near.getBoundingClientRect();
  const visible = rect.bottom > 0 && rect.top < innerHeight;
  const top = visible ? Math.min(rect.bottom + 8, innerHeight - 44) : innerHeight - 56;
  const left = visible ? Math.max(8, Math.min(rect.left, innerWidth - 260)) : innerWidth / 2 - 110;
  toast.style.top = `${top}px`;
  toast.style.left = `${left}px`;

  requestAnimationFrame(() => toast.classList.add('show'));
  timer = window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => host.remove(), 250);
  }, 1800);
}
