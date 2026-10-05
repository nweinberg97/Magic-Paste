/**
 * Getting cleaned content into the page.
 *
 * Paste events are read-only: an extension cannot rewrite the clipboard data
 * an editor is about to receive. What it *can* do is cancel the original paste
 * and deliver the cleaned version itself. These strategies are ordered from
 * "most native" to "most direct".
 */

/** Synthetic paste events we dispatched, so our own listener ignores them. */
export const syntheticPastes = new WeakSet<Event>();

export type Delivery = 'editor' | 'insert-html' | 'insert-text';

/**
 * Inputs, textareas and plain-text editors. execCommand keeps the browser's
 * undo stack and fires real input events, which frameworks like React rely on.
 */
export function insertText(element: HTMLElement, text: string): Delivery | null {
  element.focus();
  if (document.execCommand('insertText', false, text)) return 'insert-text';

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    element.setRangeText(text, start, end, 'end');
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
    return 'insert-text';
  }
  return null;
}

/**
 * Rich editors. First, hand the editor a synthetic paste event carrying the
 * cleaned HTML: framework editors (ProseMirror, Lexical, Slate, Quill 2,
 * Gmail's composer) run their own paste handling on it and keep their
 * internal state consistent. If no editor claims it, insert the HTML directly,
 * unless the destination is editor-only (Google Docs), where we step aside.
 */
export function insertRich(origin: EventTarget, element: HTMLElement, html: string, text: string, allowDirectInsert = true): Delivery | null {
  const data = new DataTransfer();
  data.setData('text/html', html);
  data.setData('text/plain', text);
  const synthetic = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true });
  syntheticPastes.add(synthetic);
  origin.dispatchEvent(synthetic);
  if (synthetic.defaultPrevented) return 'editor';
  if (!allowDirectInsert) return null;

  element.focus();
  if (document.execCommand('insertHTML', false, html)) return 'insert-html';
  return null;
}
