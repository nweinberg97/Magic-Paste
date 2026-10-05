import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { transform, type DestinationId, type FormatSettings } from '../src/engine';

function run(text: string, destination: DestinationId, settings?: Partial<FormatSettings>) {
  const result = transform({ text }, { destination, settings });
  assert.ok(result.ok);
  return result;
}

const NOTES = '## Launch\n\nShipped **onboarding** — see [the doc](https://example.com/doc).\n\n- one\n- two';
const TABLE = 'Plan\tLimit\nFree\t60\nPro\t600';

describe('destination adapters', () => {
  test('Gmail: email paragraph model, bold headings, links kept', () => {
    const result = run(NOTES, 'gmail');
    assert.equal(
      result.html,
      '<div><strong>Launch</strong></div><div><br></div><div>Shipped <strong>onboarding</strong> — see <a href="https://example.com/doc">the doc</a>.</div>' +
        '<div><br></div><ul><li>one</li><li>two</li></ul>',
    );
    const ids = result.notes.map((n) => n.id);
    assert.ok(ids.includes('email-spacing'));
    assert.ok(ids.includes('headings-flattened'));
  });

  test('Gmail: tables get a visible grid', () => {
    assert.match(run(TABLE, 'gmail').html!, /^<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">/);
  });

  test('Slack: no headings, tables become aligned monospace', () => {
    const result = run('# Limits\n\n| Plan | Limit |\n| --- | --- |\n| Free | 60 |\n| Pro | 600 |', 'slack');
    assert.match(result.html!, /^<p><strong>Limits<\/strong><\/p><pre>Plan  Limit\n----  -----\nFree  60\nPro   600<\/pre>$/);
    assert.ok(result.notes.some((n) => n.id === 'table-as-text'));
  });

  test('Notion and rich editors: semantic structure', () => {
    for (const destination of ['notion', 'rich'] as const) {
      assert.match(run(NOTES, destination).html!, /^<h2>Launch<\/h2><p>Shipped <strong>onboarding<\/strong>/);
    }
  });

  test('Google Docs: headings match the document by default, Docs heading styles on request', () => {
    const matched = run(NOTES, 'google-docs');
    assert.match(matched.html!, /^<p><strong>Launch<\/strong><\/p><p>Shipped/);
    assert.ok(matched.notes.some((n) => n.id === 'headings-flattened'));
    assert.match(run(NOTES, 'google-docs', { docsHeadingStyles: true }).html!, /^<h2>Launch<\/h2>/);
  });

  test('Google Docs only accepts cleaned content through its own paste handler', () => {
    assert.equal(run(NOTES, 'google-docs').destination.delivery, 'editor-only');
    for (const destination of ['gmail', 'slack', 'notion', 'rich', 'plain'] as const) {
      assert.equal(run(NOTES, destination).destination.delivery, 'intercept');
    }
  });

  test('every rich render carries a clean text/plain twin', () => {
    const result = run(NOTES, 'slack');
    assert.equal(result.text, 'Launch\n\nShipped onboarding — see the doc (https://example.com/doc).\n\n• one\n• two');
  });

  test('plain text destination: clean text for non-Markdown sources', () => {
    const result = run('Visit https://example.com today\n\n▪ one\n▪ two', 'plain');
    assert.equal(result.text, 'Visit https://example.com today\n\n• one\n• two');
    assert.equal(result.html, undefined);
  });
});

describe('settings', () => {
  test('links can be dropped', () => {
    const result = run(NOTES, 'rich', { preserveLinks: false });
    assert.ok(!result.html!.includes('<a '));
    assert.ok(result.html!.includes('the doc'));
    assert.ok(result.notes.some((n) => n.id === 'links-removed'));
  });

  test('emphasis can be dropped', () => {
    const result = run(NOTES, 'rich', { preserveEmphasis: false });
    assert.ok(!result.html!.includes('<strong>onboarding'));
    assert.ok(result.notes.some((n) => n.id === 'emphasis-removed'));
  });
});

describe('sanitization', () => {
  test('dangerous link schemes keep their text but lose the link', () => {
    for (const href of ['javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>', 'vbscript:x']) {
      const result = run(`[click me](${href}) and **bold**`, 'rich');
      assert.ok(!/href/.test(result.html!), href);
      assert.ok(result.html!.includes('click me'));
    }
  });

  test('markup in text is escaped, never interpreted', () => {
    const result = run('**Hi** <img src=x onerror=alert(1)> & <script>alert(1)</script>', 'rich');
    assert.equal(result.html, '<p><strong>Hi</strong> &lt;img src=x onerror=alert(1)&gt; &amp; &lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  test('attribute injection through URLs is escaped', () => {
    const result = run('[x](https://example.com/"onmouseover="alert(1)) **b**', 'rich');
    assert.ok(!result.html!.includes('"onmouseover'));
  });
});
