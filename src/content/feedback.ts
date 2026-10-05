import type { PasteMode, TransformResult } from '../engine';
import { modKey, writeClipboard } from '../ui/clipboard';
import type { SkipContext, SkipReason } from './interceptor';
import type { ToastContent } from './toast';

/** What to tell the user after a paste Magic Paste cleaned. */
export function cleanedFeedback(result: Extract<TransformResult, { ok: true }>, mode: PasteMode = 'adapt'): ToastContent {
  return {
    tone: 'cleaned',
    // Say which way the formatting went: the rule is only trustworthy if it's visible.
    title: mode === 'preserve' ? 'Pasted with its original look' : mode === 'match-style' ? 'Pasted in your document’s style' : 'Pasted cleanly',
    meta: result.destination.label,
    lines: result.notes.map((note) => note.message),
  };
}

/**
 * What to tell the user when Magic Paste left a paste alone. Silent only
 * when it's obvious why (Magic Paste is off, or the paste wasn't into a text
 * field); otherwise the user should never have to guess whether it worked.
 */
export function skippedFeedback(reason: SkipReason, { destination, result }: SkipContext = {}): ToastContent | null {
  switch (reason) {
    case 'nothing-to-fix':
      return { tone: 'normal', title: 'Pasted normally', meta: destination, lines: ['Already clean: nothing to fix.'] };
    case 'not-delivered':
      return {
        tone: 'warning',
        title: 'Not cleaned',
        meta: destination,
        lines: [`${destination ?? 'This editor'} didn’t accept the cleaned version, so this was a normal paste.`],
        // Put the cleaned version on the clipboard: the editor's own paste then brings it in.
        action: result
          ? {
              label: 'Copy cleaned version',
              run: async () => {
                await writeClipboard(result.text, result.html, topWindow());
                return `Copied. Undo, then paste again (${modKey}).`;
              },
            }
          : undefined,
      };
    case 'already-cleaned':
      return { tone: 'cleaned', title: 'Pasted the cleaned version', meta: destination, lines: ['Magic Paste cleaned this before you pasted.'] };
    case 'transform-failed':
      return { tone: 'normal', title: 'Pasted normally', meta: destination, lines: ['Nothing Magic Paste could improve here.'] };
    case 'plain-paste-shortcut':
      return { tone: 'normal', title: 'Pasted as plain text', lines: ['That shortcut is your browser’s plain paste, so Magic Paste stayed out of it.'] };
    case 'files':
      return { tone: 'normal', title: 'Pasted normally', lines: ['Images and files pass through untouched.'] };
    case 'code-editor':
    case 'disabled':
    case 'not-editable':
    case 'no-data':
      return null;
  }
}

function topWindow(): Window {
  try {
    return window.top && window.top.document ? window.top : window;
  } catch {
    return window;
  }
}
