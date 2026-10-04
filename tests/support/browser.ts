import * as esbuild from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import type { PastePayload, TransformOptions, TransformResult } from '../../src/engine';

/**
 * The HTML parser relies on the browser's DOMParser, so HTML tests run the
 * engine inside real Chromium: the same parser it uses in production.
 */
export interface BrowserEngine {
  transform(payload: PastePayload, options: TransformOptions): Promise<PlainResult>;
  close(): Promise<void>;
}

/** TransformResult minus the adapter object (functions don't cross the page boundary). */
export type PlainResult =
  | (Omit<Extract<TransformResult, { ok: true }>, 'destination' | 'notes'> & { ok: true; destination: string; notes: string[]; noteIds: string[] })
  | Extract<TransformResult, { ok: false }>;

export async function launchEngine(): Promise<BrowserEngine> {
  const bundle = await esbuild.build({
    entryPoints: ['src/engine/index.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'MagicPaste',
  });
  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  return {
    transform: (payload, options) =>
      page.evaluate(
        ([payload, options]) => {
          const engine = (window as unknown as { MagicPaste: typeof import('../../src/engine') }).MagicPaste;
          const result = engine.transform(payload, options);
          if (!result.ok) return result;
          return {
            ...result,
            destination: result.destination.id,
            notes: result.notes.map((n) => n.message),
            noteIds: result.notes.map((n) => n.id),
          };
        },
        [payload, options] as const,
      ) as Promise<PlainResult>,
    close: () => browser.close(),
  };
}

export function assertOk(result: PlainResult): asserts result is Extract<PlainResult, { ok: true }> {
  if (!result.ok) throw new Error(`transform failed: ${result.reason} ${result.message ?? ''}`);
}
