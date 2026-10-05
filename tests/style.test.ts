import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import * as esbuild from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { cleanColor, cleanFontFamily, cleanFontSize, cleanLength } from '../src/engine/style/css';
import { styleScope } from '../src/extension/styles';
import { SAMPLES } from '../src/playground/samples';

// Style learning parses clipboard HTML with DOMParser, so it runs in Chromium.

let browser: Browser;
let page: Page;

before(async () => {
  const bundle = await esbuild.build({
    stdin: { contents: "export { learnStyle, describeProfile, transform } from './src/engine';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'MagicPaste',
  });
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
});
after(() => browser?.close());

type Engine = typeof import('../src/engine');
const learn = (html: string) => page.evaluate((html) => (window as unknown as { MagicPaste: Engine }).MagicPaste.learnStyle(html), html);

const sample = SAMPLES.find((s) => s.id === 'resume-template')!;

describe('learning a document’s style', () => {
  test('learns headings, entries, bullets and body text from copied Google Docs HTML', async () => {
    const profile = await learn(sample.template!);
    assert.ok(profile);
    assert.deepEqual(profile.heading?.text, { fontFamily: "'Times New Roman', serif", fontSize: '13pt', color: '#2f4b8c', bold: true, italic: false });
    assert.equal(profile.heading?.caps, true);
    assert.equal(profile.heading?.ruleBefore, true);
    assert.equal(profile.entry?.datesRight, true);
    assert.equal(profile.entry?.dateItalic, true);
    assert.equal(profile.bullet?.text.fontSize, '11.5pt');
    assert.equal(profile.body?.text.fontFamily, "'Times New Roman', serif");
  });

  test('summarises what it learned in plain words', async () => {
    const summary = await page.evaluate((html) => {
      const engine = (window as unknown as { MagicPaste: Engine }).MagicPaste;
      return engine.describeProfile(engine.learnStyle(html)!);
    }, sample.template!);
    assert.equal(summary, 'Learned headings (all caps, coloured, line above), entries with dates on the right, bullets and text in Times New Roman 11.5pt.');
  });

  test('nothing to learn from unstyled or empty input', async () => {
    assert.equal(await learn(''), null);
    assert.equal(await learn('<meta charset="utf-8"><span>   </span>'), null);
  });

  test('a body-only sample still teaches the font', async () => {
    const profile = await learn('<p style="font-family:Georgia;font-size:12pt;color:#333">A plain paragraph of body text that goes on for a while.</p>');
    assert.equal(profile?.body?.text.fontFamily, 'Georgia');
    assert.equal(profile?.heading, undefined);
  });

  test('hostile CSS never makes it into a profile', async () => {
    const profile = await learn(
      '<p style="font-family:x;}body{background:url(javascript:alert(1));font-size:expression(alert(1));color:red;background-image:url(https://evil.example/t.png)"><b>HEADING</b></p>' +
        '<p style="font-family:&quot;Evil&quot;);behavior:url(x.htc);margin-top:calc(1px+1px)">Body text that is long enough to be treated as the body paragraph here.</p>',
    );
    const serialized = JSON.stringify(profile);
    assert.doesNotMatch(serialized, /url|expression|javascript|behavior|calc|evil\.example/i);
  });
});

describe('pasting in a learned style', () => {
  test('new content takes on the template’s look', async () => {
    const result = await page.evaluate(
      ([payload, template]) => {
        const engine = (window as unknown as { MagicPaste: Engine }).MagicPaste;
        const r = engine.transform(payload, { destination: 'google-docs', style: engine.learnStyle(template)! });
        return r.ok ? { html: r.html!, notes: r.notes.map((n) => n.message) } : null;
      },
      [sample.payload, sample.template!] as const,
    );
    assert.ok(result);
    // Headings: rule above, all caps, the template's blue.
    assert.match(result.html, /^<hr style="border:none;border-top:1px solid #999999"><p style="[^"]*"><span style="[^"]*color:#2f4b8c;font-weight:700[^"]*">PROFILE<\/span><\/p>/);
    assert.match(result.html, />PROFESSIONAL EXPERIENCE</);
    // Entries: dates split off and set flush right, in italics.
    assert.match(result.html, /<strong>Harbor &amp; Pine,<\/strong> <em>Operations Coordinator<\/em><\/span>/);
    assert.match(result.html, /text-align:right[^>]*><span style="[^"]*font-style:italic">Mar 2021 – Jun 2023<\/span>/);
    // Bullets: the template's font and size.
    assert.match(result.html, /<li style="font-family:&#39;Times New Roman&#39;, serif;font-size:11.5pt/);
    assert.deepEqual(result.notes.slice(0, 1), ['Matched your document’s style (3 headings, 3 entries, 5 bullets, 1 paragraph)']);
  });
});

describe('style values and scopes (Node)', () => {
  test('CSS values are allowlisted', () => {
    assert.equal(cleanFontFamily('"Times New Roman", serif'), "'Times New Roman', serif");
    assert.equal(cleanFontFamily('x;}body{color:red'), undefined);
    assert.equal(cleanFontSize('11.5pt'), '11.5pt');
    assert.equal(cleanFontSize('400pt'), undefined);
    assert.equal(cleanFontSize('expression(1)'), undefined);
    assert.equal(cleanColor('rgb(47, 75, 140)'), '#2f4b8c');
    assert.equal(cleanColor('#ABC'), '#aabbcc');
    assert.equal(cleanColor('red;background:url(x)'), undefined);
    assert.equal(cleanColor('rgba(0,0,0,0)'), undefined);
    assert.equal(cleanLength('calc(1px + 1px)'), undefined);
  });

  test('styles belong to one Google Doc, or to a site', () => {
    assert.equal(styleScope('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit?tab=t.0'), 'gdoc:1AbCdEfGhIjKlMnOp');
    assert.equal(styleScope('https://docs.google.com/document/u/1/d/1AbCdEfGhIjKlMnOp/edit'), 'gdoc:1AbCdEfGhIjKlMnOp');
    assert.equal(styleScope('https://mail.google.com/mail/u/0/'), 'site:mail.google.com');
    assert.equal(styleScope('chrome://extensions'), null);
    assert.equal(styleScope(undefined), null);
  });
});
