import type { PastePayload } from '../engine';

/** Read both rich and plain representations from the system clipboard. */
export async function readClipboard(): Promise<PastePayload> {
  const items = await navigator.clipboard.read();
  const payload: PastePayload = {};
  for (const item of items) {
    if (!payload.html && item.types.includes('text/html')) payload.html = await (await item.getType('text/html')).text();
    if (!payload.text && item.types.includes('text/plain')) payload.text = await (await item.getType('text/plain')).text();
  }
  return payload;
}

/** Marks HTML that Magic Paste already cleaned, so pasting it again isn't processed twice. */
export const CLEANED_MARKER = '<meta name="generator" content="magic-paste">';

/** Write cleaned output back with both flavours, so any destination gets its best option. */
export async function writeClipboard(text: string, html?: string, win: Window = window): Promise<void> {
  const Item = (win as Window & typeof globalThis).ClipboardItem;
  const parts: Record<string, Blob> = { 'text/plain': new Blob([text], { type: 'text/plain' }) };
  if (html) parts['text/html'] = new Blob([CLEANED_MARKER + html], { type: 'text/html' });
  await win.navigator.clipboard.write([new Item(parts)]);
}

export const modKey = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘V' : 'Ctrl+V';
