import type { PasteTarget } from '../engine';

export interface ResolvedTarget {
  element: HTMLElement;
  info: PasteTarget;
}

/** Text-like inputs only; we never touch passwords, numbers, dates, etc. */
const TEXT_INPUTS = new Set(['', 'text', 'search', 'url', 'tel', 'email']);

const CODE_EDITORS = '.monaco-editor, .cm-editor, .CodeMirror, .ace_editor, [data-magic-paste="off"]';

/**
 * Work out what is receiving the paste. Returns null for anything Magic Paste
 * should leave alone.
 */
export function resolveTarget(eventTarget: EventTarget | null, hostname: string): ResolvedTarget | null {
  const start = eventTarget instanceof Element ? eventTarget : eventTarget instanceof Node ? eventTarget.parentElement : null;
  if (!start) return null;

  const override = start.closest<HTMLElement>('[data-magic-paste-destination]')?.dataset.magicPasteDestination;
  const codeEditor = !!start.closest(CODE_EDITORS);

  if (start instanceof HTMLTextAreaElement || start instanceof HTMLInputElement) {
    if (start.readOnly || start.disabled) return null;
    if (start instanceof HTMLInputElement && !TEXT_INPUTS.has(start.type)) return null;
    const kind = start instanceof HTMLInputElement ? 'input' : 'textarea';
    return { element: start, info: { hostname, kind, singleLine: kind === 'input', codeEditor, override } };
  }

  const host = editingHost(start);
  if (!host) return null;
  const plaintext = host.getAttribute('contenteditable') === 'plaintext-only';
  return {
    element: host,
    info: { hostname, kind: plaintext ? 'plaintext-editable' : 'rich', singleLine: false, codeEditor, override, empty: isBlank(host, hostname) },
  };
}

function editingHost(element: Element): HTMLElement | null {
  if (!(element instanceof HTMLElement) || !element.isContentEditable) return null;
  let host: HTMLElement = element;
  while (host.parentElement?.isContentEditable) host = host.parentElement;
  return host;
}

/**
 * Is this editor blank? Unknown (undefined) for canvas editors like Google
 * Docs, whose visible text isn't in the page, and for hidden input surfaces.
 */
function isBlank(host: HTMLElement, hostname: string): boolean | undefined {
  if (hostname === 'docs.google.com') return undefined;
  const rect = (host.ownerDocument.defaultView?.frameElement ?? host).getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return undefined;
  return !host.innerText.trim();
}
