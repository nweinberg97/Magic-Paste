import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium, type BrowserContext, type Page, type Worker } from 'playwright';

/**
 * End to end: load the built extension into Chromium, open a page with
 * different kinds of editors, put real content on the system clipboard and
 * press Cmd/Ctrl+V.
 */

const EXTENSION = resolve('dist');
let context: BrowserContext;
let worker: Worker;
let server: Server;
let origin: string;
let page: Page;

before(async () => {
  const build = spawnSync(process.execPath, ['scripts/build.js'], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);

  const fixture = await readFile('tests/fixtures/editors.html');
  server = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(fixture));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', // full Chromium: headless mode that supports extensions
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  page = await context.newPage();
});

after(async () => {
  await context?.close();
  server?.close();
});

async function setSettings(patch: Record<string, unknown>): Promise<void> {
  await worker.evaluate(async (patch) => {
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(settings as object), ...patch } });
  }, patch);
}

async function freshPage(): Promise<void> {
  await page.goto(`${origin}/editors.html`);
  await page.waitForTimeout(150); // let the content script load settings
}

/** Give an editor existing content, so pastes adapt to it rather than keep the source's look. */
async function prefill(selector: string): Promise<void> {
  await page.$eval(selector, (el) => {
    el.innerHTML = '<p>Existing notes</p>';
  });
}

async function paste(selector: string, payload: { text: string; html?: string }): Promise<void> {
  await page.click(selector); // focus first: the clipboard API only works in a focused document
  await page.evaluate(async ({ text, html }) => {
    const parts: Record<string, Blob> = { 'text/plain': new Blob([text], { type: 'text/plain' }) };
    if (html) parts['text/html'] = new Blob([html], { type: 'text/html' });
    await navigator.clipboard.write([new ClipboardItem(parts)]);
  }, payload);
  await page.keyboard.press('ControlOrMeta+V');
  await page.waitForTimeout(100);
}

const MESSY = { text: '# Plan\n\n\n•   Workout\n•    Build   project\n\nThis is **important**.' };
const STYLED = {
  text: 'Rate limits',
  html: '<h2 style="font-family:Georgia;font-size:34px;color:#111">Rate limits</h2><p style="background:#fffbe6;font-size:17px">Use <span style="font-weight:700">backoff</span>, see <a href="https://example.com/docs" style="color:purple">docs</a>.</p>',
};

describe('extension end to end', () => {
  test('textarea receives clean text (Markdown kept as Markdown)', async () => {
    await freshPage();
    await paste('#textarea', MESSY);
    assert.equal(await page.inputValue('#textarea'), '# Plan\n\n- Workout\n- Build project\n\nThis is **important**.');
  });

  test('single-line input gets one tidy line', async () => {
    await freshPage();
    await paste('#input', { text: '  Weekly   plan\nfor the team ' });
    assert.equal(await page.inputValue('#input'), 'Weekly plan for the team');
  });

  test('an editor that already has content: pasted content adopts its formatting', async () => {
    await freshPage();
    await prefill('#rich');
    await paste('#rich', STYLED);
    const markup = await page.innerHTML('#rich');
    assert.match(markup, /<h2>Rate limits<\/h2>/);
    assert.match(markup, /<strong>backoff<\/strong>/);
    assert.match(markup, /<a href="https:\/\/example.com\/docs">docs<\/a>/);
    assert.doesNotMatch(markup, /Georgia|34px|fffbe6|purple/);
  });

  test('a blank editor: pasted content keeps its own look, minus the malfunctions', async () => {
    await freshPage();
    await paste('#rich', {
      text: 'Rate limits',
      html:
        '<h2 style="font-family:Georgia;font-size:28px;color:#1f3a8a">Rate limits</h2>' +
        '<p style="background:#111;color:#f5f5f5">Copied from a dark-mode page</p>' +
        '<p><span style="float:left;font-size:66px">E</span>very drop cap</p>',
    });
    const markup = await page.innerHTML('#rich');
    assert.match(markup, /font-family: ?Georgia/); // the source's font survives
    assert.match(markup, /28px/);
    assert.match(markup, /#1f3a8a|rgb\(31, 58, 138\)/);
    assert.doesNotMatch(markup, /#111|f5f5f5|245, 245, 245|66px/); // dark backgrounds, invisible text, drop caps don't
  });

  test('framework editors get the cleaned data through their own paste handler, exactly once', async () => {
    await freshPage();
    await prefill('#framework');
    await paste('#framework', STYLED);
    const data = await page.$eval('#framework', (el) => ({ ...(el as HTMLElement).dataset }));
    assert.equal(data.pasteCount, '1');
    assert.equal(data.receivedHtml, '<h2>Rate limits</h2><p>Use <strong>backoff</strong>, see <a href="https://example.com/docs">docs</a>.</p>');
    assert.equal(data.receivedText, 'Rate limits\n\nUse backoff, see docs (https://example.com/docs).');
  });

  test('Google Docs-style editors get cleaned content through their own paste handler, headings matching the document', async () => {
    await freshPage();
    await prefill('#docs-handled');
    await paste('#docs-handled', STYLED);
    const data = await page.$eval('#docs-handled', (el) => ({ ...(el as HTMLElement).dataset }));
    assert.equal(data.pasteCount, '1');
    assert.equal(data.receivedHtml, '<p><strong>Rate limits</strong></p><p>Use <strong>backoff</strong>, see <a href="https://example.com/docs">docs</a>.</p>');
  });

  test('if a Google Docs-style editor declines, the normal paste goes through (nothing inserted twice)', async () => {
    await freshPage();
    await paste('#docs-unhandled', STYLED);
    const markup = await page.innerHTML('#docs-unhandled');
    assert.match(markup, /Georgia|34px/); // the browser's own paste, untouched
    assert.equal((markup.match(/Rate limits/g) ?? []).length, 1);
  });

  test('a learned document style is applied to pastes on that page', async () => {
    const profile = {
      version: 1,
      heading: { text: { fontFamily: "'Times New Roman', serif", fontSize: '13pt', color: '#2f4b8c', bold: true }, block: {}, caps: true, ruleBefore: true },
      body: { text: { fontFamily: "'Times New Roman', serif", fontSize: '11.5pt', color: '#000000' }, block: {} },
    };
    await worker.evaluate((profile) => chrome.storage.local.set({ documentStyles: { 'site:127.0.0.1': { profile, label: 'Resume', learnedAt: 0 } } }), profile);
    await freshPage();
    await paste('#framework', STYLED);
    const html = await page.$eval('#framework', (el) => (el as HTMLElement).dataset.receivedHtml ?? '');
    assert.match(html, /^<hr[^>]*><p[^>]*><span style="[^"]*color:#2f4b8c[^"]*">RATE LIMITS<\/span><\/p>/);
    assert.match(html, /font-size:11.5pt[^"]*">Use <strong>backoff<\/strong>/);
    await worker.evaluate(() => chrome.storage.local.set({ documentStyles: {} }));
  });

  test('every paste says what happened: cleaned, or why not', async () => {
    const toast = () => page.$eval('#magic-paste-toast', (el) => (el as HTMLElement).dataset.tone).catch(() => null);
    await freshPage();
    await paste('#rich', STYLED);
    assert.equal(await toast(), 'cleaned');

    await freshPage();
    await paste('#textarea', { text: 'Nothing to fix here.' });
    assert.equal(await toast(), 'normal');
  });

  test('feedback from an editor inside a hidden iframe (like Google Docs) shows on the visible page', async () => {
    await freshPage();
    await page.evaluate(async (payload) => {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([payload.text], { type: 'text/plain' }), 'text/html': new Blob([payload.html], { type: 'text/html' }) })]);
    }, STYLED);
    const frame = page.frameLocator('#frame-editor');
    await frame.locator('body').focus();
    await page.keyboard.press('ControlOrMeta+V');
    await page.waitForTimeout(150);
    // The frame's editor doesn't accept the cleaned paste, so the user is told, on the top page.
    assert.equal(await page.$eval('#magic-paste-toast', (el) => (el as HTMLElement).dataset.tone), 'warning');
  });

  test('content Magic Paste already cleaned (Clean clipboard, Copy cleaned version) is pasted as-is, and says so', async () => {
    await freshPage();
    await paste('#rich', { text: 'Rate limits', html: '<meta name="generator" content="magic-paste"><p><strong>Rate limits</strong></p>' });
    assert.equal(await page.innerHTML('#rich'), '<p><strong>Rate limits</strong></p>');
    assert.equal(await page.$eval('#magic-paste-toast', (el) => (el as HTMLElement).dataset.tone), 'cleaned');
  });

  test('code editors are left alone', async () => {
    await freshPage();
    await paste('#code', MESSY);
    // Native paste: blank lines and spacing survive untouched (Chrome stores the spaces as NBSPs).
    const text = (await page.innerText('#code')).replaceAll(String.fromCharCode(0xa0), ' ');
    assert.match(text, /# Plan\n\n\n/);
    assert.match(text, /•   Workout/);
  });

  test('already-clean text passes through untouched', async () => {
    await freshPage();
    await paste('#textarea', { text: 'Nothing to fix here.' });
    assert.equal(await page.inputValue('#textarea'), 'Nothing to fix here.');
  });

  test('turning Magic Paste off restores normal paste', async () => {
    await setSettings({ enabled: false });
    await freshPage();
    await paste('#textarea', MESSY);
    assert.equal(await page.inputValue('#textarea'), MESSY.text);
    await setSettings({ enabled: true });
  });

  test('pausing a site restores normal paste there', async () => {
    await setSettings({ pausedSites: ['127.0.0.1'] });
    await freshPage();
    await paste('#textarea', MESSY);
    assert.equal(await page.inputValue('#textarea'), MESSY.text);
    await setSettings({ pausedSites: [] });
  });

  test('pastes are recorded in the popup’s recent activity', async () => {
    await freshPage();
    await paste('#rich', STYLED);
    const id = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForSelector('#activity li .route');
    const routes = await popup.$$eval('#activity .route', (items) => items.map((item) => item.textContent));
    assert.ok(routes.includes('Web page→Rich text'), `got ${routes}`);
    await popup.close();
  });

  test('the playground’s live editor runs the same interceptor', async () => {
    const id = new URL(worker.url()).host;
    await page.goto(`chrome-extension://${id}/playground.html`);
    await page.click('[data-destination="slack"]');
    await paste('#live-editor', STYLED);
    const markup = await page.innerHTML('#live-editor');
    assert.match(markup, /<p><strong>Rate limits<\/strong><\/p>/); // Slack: headings become bold
    assert.doesNotMatch(markup, /Georgia|34px/);
  });
});
