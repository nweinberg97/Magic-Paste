import { choosePasteMode, detectDestination, transform, type PasteMode, type StyleProfile, type TransformResult } from '../engine';
import { isActiveOn, type Settings } from '../extension/settings';
import { insertRich, insertText, syntheticPastes, type Delivery } from './insert';
import { resolveTarget } from './target';
import { CLEANED_MARKER } from '../ui/clipboard';

export interface PastedInfo {
  result: Extract<TransformResult, { ok: true }>;
  element: HTMLElement;
  delivery: Delivery;
  /** The original clipboard text, before transformation. */
  clipboardText: string;
  mode: PasteMode;
}

export interface InterceptorOptions {
  hostname: string;
  /** Null until settings have loaded; Magic Paste stays out of the way until then. */
  getSettings(): Settings | null;
  /** The destination document's learned style, if the user taught Magic Paste one. */
  getStyle?(): StyleProfile | undefined;
  onPasted?(info: PastedInfo): void;
  /** Called when a paste is left alone; `destination` and `element` are known once the target is. */
  onSkip?(reason: SkipReason, context: SkipContext): void;
}

export interface SkipContext {
  destination?: string;
  element?: HTMLElement;
  /** The cleaned result, when there was one but it couldn't be delivered. */
  result?: Extract<TransformResult, { ok: true }>;
}

/** Why a paste was left alone. Useful in tests and for debugging. */
export type SkipReason =
  | 'disabled'
  | 'plain-paste-shortcut'
  | 'not-editable'
  | 'code-editor'
  | 'files'
  | 'no-data'
  | 'transform-failed'
  | 'nothing-to-fix'
  | 'already-cleaned'
  | 'not-delivered';

/**
 * Installs the paste interceptor on a window. Shared by the content script
 * and the playground's live demo, so the demo runs the real code path.
 *
 * Contract: every exit that isn't a successful delivery returns without
 * touching the event, so the browser's normal paste happens. Magic Paste
 * should never make paste worse.
 */
export function installPasteInterceptor(win: Window, options: InterceptorOptions): () => void {
  let plainPasteShortcutAt = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    // Cmd/Ctrl+Shift+V is the user explicitly asking for the browser's plain paste. Respect it.
    if (event.shiftKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') plainPasteShortcutAt = Date.now();
  };

  const onPaste = (event: ClipboardEvent) => {
    if (syntheticPastes.has(event)) return;
    const context: SkipContext = {};
    const skip = (reason: SkipReason) => options.onSkip?.(reason, context);
    try {
      const settings = options.getSettings();
      if (!settings || !isActiveOn(settings, options.hostname)) return skip('disabled');
      if (Date.now() - plainPasteShortcutAt < 1000) return skip('plain-paste-shortcut');

      const target = resolveTarget(event.composedPath()[0] ?? event.target, options.hostname);
      if (!target) return skip('not-editable');
      context.element = target.element;
      const destination = detectDestination(target.info, settings.destinationAware);
      if (!destination) return skip('code-editor');
      context.destination = destination.label;

      const data = event.clipboardData;
      if (!data) return skip('no-data');
      const html = data.getData('text/html');
      const text = data.getData('text/plain');
      if (data.files.length && !text) return skip('files');
      // Chrome prefixes clipboard HTML with a <meta> tag, so look near the start rather than at it.
      if (html.slice(0, 200).includes(CLEANED_MARKER)) return skip('already-cleaned');

      const learned = options.getStyle?.();
      const mode = choosePasteMode(destination, target.info, !!learned);
      const result = transform(
        { html, text },
        { destination: destination.id, settings, singleLine: target.info.singleLine, style: mode === 'match-style' ? learned : undefined, mode: mode === 'preserve' ? 'preserve' : 'adapt' },
      );
      if (!result.ok) return skip('transform-failed');
      if (!result.changed) return skip('nothing-to-fix');
      context.result = result;

      const delivery =
        destination.mode === 'plain' || !result.html
          ? insertText(target.element, result.text)
          : insertRich(event.composedPath()[0] ?? target.element, target.element, result.html, result.text, destination.delivery === 'intercept');
      if (!delivery) return skip('not-delivered');

      event.preventDefault();
      event.stopImmediatePropagation();
      options.onPasted?.({ result, element: target.element, delivery, clipboardText: text, mode });
    } catch (error) {
      // Fall through to the browser's own paste.
      console.debug('[Magic Paste] left paste untouched:', error);
    }
  };

  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('paste', onPaste, true);
  return () => {
    win.removeEventListener('keydown', onKeyDown, true);
    win.removeEventListener('paste', onPaste, true);
  };
}
