import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ADAPTERS, type DestinationId } from '../src/engine';
import { SAMPLES } from '../src/playground/samples';
import { SPECIMENS } from '../src/testkit/specimens';
import { assertOk, launchEngine, type BrowserEngine } from './support/browser';

let engine: BrowserEngine;
before(async () => (engine = await launchEngine()));
after(() => engine?.close());

async function html(markup: string, destination: DestinationId = 'rich') {
  const result = await engine.transform({ html: markup, text: 'fallback text' }, { destination });
  assertOk(result);
  return result;
}

describe('HTML input', () => {
  test('strips fonts, sizes, colours and classes but keeps meaning', async () => {
    const result = await html(
      '<p class="lead" style="font-family:Georgia;font-size:22px;color:#333;background:#fffbe6">Rate <span style="font-weight:700">limits</span> apply. ' +
        '<font face="Comic Sans" color="red">Really</font>.</p>',
    );
    assert.equal(result.html, '<p>Rate <strong>limits</strong> apply. Really.</p>');
    assert.ok(result.noteIds.includes('styles'));
  });

  test('keeps semantic headings and lists, flattens h4-h6 to h3', async () => {
    const result = await html('<h1>A</h1><h2>B</h2><h5>C</h5><ul><li>one</li><li>two</li></ul><ol start="3"><li>three</li></ol>');
    assert.equal(result.html, '<h1>A</h1><h2>B</h2><h3>C</h3><ul><li>one</li><li>two</li></ul><ol start="3"><li>three</li></ol>');
  });

  test('nested lists', async () => {
    const result = await html('<ul><li>Travel<ul><li>Flights<ol><li>Book</li></ol></li></ul></li><li>Budget</li></ul>');
    assert.equal(result.html, '<ul><li>Travel<ul><li>Flights<ol><li>Book</li></ol></li></ul></li><li>Budget</li></ul>');
  });

  test('bold inside headings is source noise', async () => {
    assert.equal((await html('<h2><b>Title</b></h2>')).html, '<h2>Title</h2>');
  });

  test('preserves links, drops unsafe and relative ones', async () => {
    const result = await html(
      '<p><a href="https://example.com/a">safe</a> <a href="javascript:alert(1)">evil</a> <a href="/relative">relative</a> <a href="mailto:hi@example.com">mail</a></p>',
    );
    assert.equal(result.html, '<p><a href="https://example.com/a">safe</a> evil relative <a href="mailto:hi@example.com">mail</a></p>');
    assert.ok(result.noteIds.includes('unsafe'));
    assert.equal(result.notes.find((n) => n.startsWith('Preserved')), 'Preserved 2 links');
  });

  test('removes scripts, event handlers, forms and hidden text', async () => {
    const result = await html(
      '<p onclick="steal()">Hello<script>alert(1)</script><button>Follow</button>world</p><style>p{color:red}</style>' +
        '<iframe src="https://evil.example"></iframe><p aria-hidden="true">icon</p><p><span class="sr-only">Opens in new tab</span>Visible</p><p style="display:none">gone</p>',
    );
    assert.equal(result.html, '<p>Hello world</p><p>Visible</p>');
  });

  test('malformed HTML is repaired by the browser parser, not passed through', async () => {
    const result = await html('<p>Unclosed <b>bold <i>both</p><div><li>stray item</div><table><tr><td>a<td>b</table');
    // The HTML spec's repair carries the open <b><i> forward; we keep that meaning and nothing else.
    assert.equal(
      result.html,
      // (A one-row table is layout, like an email signature, so its cells become paragraphs.)
      '<p>Unclosed <strong>bold </strong><strong><em>both</em></strong></p><p><strong><em>stray item</em></strong></p><p>a</p><p>b</p>',
    );
  });

  test('turns <br><br> pseudo-paragraphs into paragraphs', async () => {
    const result = await html('<div>First line<br><br><br>Second para<br>same para</div>');
    assert.equal(result.html, '<p>First line</p><p>Second para<br>same para</p>');
  });

  test('data tables survive, layout tables dissolve', async () => {
    const data = await html('<table><thead><tr><th>Plan</th><th>Rate</th></tr></thead><tbody><tr><td>Pro</td><td><b>600</b></td></tr></tbody></table>');
    assert.equal(data.html, '<table><thead><tr><th>Plan</th><th>Rate</th></tr></thead><tbody><tr><td>Pro</td><td><strong>600</strong></td></tr></tbody></table>');
    const layout = await html('<table><tr><td><p>Just</p><p>content</p></td></tr></table>');
    assert.equal(layout.html, '<p>Just</p><p>content</p>');
  });

  test('images: kept for rich destinations, dropped (and reported) for Slack, tracking pixels ignored', async () => {
    const markup = '<p>Chart:</p><img src="https://example.com/chart.png" alt="Q3 chart"><img src="https://t.example/p.gif" width="1" height="1">';
    assert.equal((await html(markup, 'rich')).html, '<p>Chart:</p><img src="https://example.com/chart.png" alt="Q3 chart">');
    const slack = await html(markup, 'slack');
    assert.equal(slack.html, '<p>Chart:</p>');
    assert.ok(slack.notes.includes("Left out 1 image the destination can't accept"));
  });

  test('code copied from editors as styled divs becomes a code block', async () => {
    const vscode =
      '<div style="color: #d4d4d4;background-color: #1e1e1e;font-family: Menlo, monospace;white-space: pre;"><div><span style="color: #c586c0;">if</span> (ready) {</div><div>  <span style="color: #dcdcaa;">ship</span>();</div><div>}</div></div>';
    assert.equal((await html(vscode)).html, '<pre><code>if (ready) {\n  ship();\n}</code></pre>');
  });
});

describe('keeping the source look (blank destinations)', () => {
  const keep = async (markup: string) => {
    const result = await engine.transform({ html: markup, text: 'x' }, { destination: 'rich', mode: 'preserve' });
    assertOk(result);
    return result;
  };

  test('keeps fonts, sizes and colours, including those set on blocks', async () => {
    const result = await keep('<h1 style="font-family:Georgia;font-size:30px;color:#1f3a8a">Title</h1><ul style="font-size:18px"><li>Item</li></ul>');
    assert.equal(
      result.html,
      '<h1><span style="font-family:Georgia;font-size:30px;color:#1f3a8a">Title</span></h1><ul><li><span style="font-size:18px">Item</span></li></ul>',
    );
    assert.ok(result.noteIds.includes('kept-source'));
    assert.ok(!result.noteIds.includes('styles'));
  });

  test('repairs what would malfunction: invisible light text, drop caps, backgrounds, layout', async () => {
    const result = await keep(
      '<p style="color:#fafafa;background:#000;width:600px;position:absolute">Dark mode</p><p><span style="float:left;font-size:66px">E</span>very day</p>',
    );
    assert.equal(result.html, '<p>Dark mode</p><p>Every day</p>');
    assert.ok(result.noteIds.includes('invisible-text'));
    assert.ok(result.noteIds.includes('oversized'));
  });

  test('the same paste into a destination with a design drops the source look entirely', async () => {
    const result = await engine.transform({ html: '<p style="font-family:Georgia;color:#1f3a8a">Hello <b>there</b></p>', text: 'x' }, { destination: 'rich' });
    assertOk(result);
    assert.equal(result.html, '<p>Hello <strong>there</strong></p>');
    assert.ok(!result.noteIds.includes('kept-source'));
  });
});

describe('tables', () => {
  test('merged cells are expanded so columns stay aligned', async () => {
    const result = await html(
      '<table><tr><th rowspan="2">Plan</th><th colspan="2">Limits</th></tr><tr><th>Rate</th><th>Storage</th></tr><tr><td>Pro</td><td colspan="2">Custom</td></tr></table>',
    );
    assert.equal(
      result.html,
      '<table><thead><tr><th>Plan</th><th>Limits</th><th></th></tr></thead><tbody><tr><td></td><td>Rate</td><td>Storage</td></tr><tr><td>Pro</td><td>Custom</td><td></td></tr></tbody></table>',
    );
  });

  test('a bold first row is a header; one-row layout tables (signatures) dissolve', async () => {
    assert.match((await html('<table><tr><td><b>A</b></td><td><b>B</b></td></tr><tr><td>1</td><td>2</td></tr></table>')).html!, /^<table><thead>/);
    assert.equal((await html('<table><tr><td><img src="https://example.com/logo.png" alt="Logo"></td><td><b>Jordan</b><br>Acme</td></tr></table>')).html, '<img src="https://example.com/logo.png" alt="Logo"><p><strong>Jordan</strong><br>Acme</p>');
  });
});

describe('more real-world repairs', () => {
  test('emoji sequences survive (zero-width joiners are kept)', async () => {
    const result = await html('<p>👩🏽‍💻 and 👨‍👩‍👧</p>');
    assert.equal(result.html, '<p>👩🏽‍💻 and 👨‍👩‍👧</p>');
  });

  test('Word list markers without mso-list:Ignore are removed', async () => {
    const result = await html('<p style="mso-list:l0 level1 lfo1"><span style="font-family:Symbol">·</span><span>&nbsp;&nbsp;&nbsp;</span>Budget approved</p><p style="mso-list:l0 level2 lfo1">o&nbsp;&nbsp;Marketing</p>');
    assert.equal(result.html, '<ul><li>Budget approved<ul><li>Marketing</li></ul></li></ul>');
  });

  test('flex layouts keep their visual spacing', async () => {
    assert.equal((await html('<div style="display:flex"><span>By Amara</span><span>·</span><time>Oct 2</time></div>')).html, '<p>By Amara · Oct 2</p>');
  });
});

describe('real-world sources', () => {
  test('Google Docs: unwraps the font-weight:normal <b>, keeps real bold/italic, rebuilds aria-level nesting', async () => {
    const docs =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><p dir="ltr"><span style="font-weight:400">Overall: </span>' +
      '<span style="font-weight:700">strong hire</span><span style="font-style:italic;font-weight:400"> indeed</span></p><br>' +
      '<ul><li aria-level="1"><p><span>Systems</span></p></li><li aria-level="2"><p><span>Design system</span></p></li><li aria-level="1"><p><span>Collaboration</span></p></li></ul></b>';
    const result = await html(docs);
    assert.equal(
      result.html,
      '<p>Overall: <strong>strong hire</strong><em> indeed</em></p><ul><li>Systems<ul><li>Design system</li></ul></li><li>Collaboration</li></ul>',
    );
    assert.equal(result.source.label, 'Google Docs');
  });

  test('Microsoft Word: mso-list paragraphs become a real nested list', async () => {
    const word =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>' +
      '<p class=MsoListParagraphCxSpFirst style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>Agenda<o:p></o:p></p>' +
      '<p class=MsoListParagraphCxSpMiddle style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">o<span>&nbsp;</span></span>Budget<o:p></o:p></p>' +
      '<p class=MsoListParagraphCxSpLast style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;</span></span>Hiring<o:p></o:p></p>' +
      '<p class=MsoNormal>After the list<o:p>&nbsp;</o:p></p></body></html>';
    const result = await html(word);
    assert.equal(result.html, '<ul><li>Agenda<ul><li>Budget</li></ul></li><li>Hiring</li></ul><p>After the list</p>');
    assert.ok(result.noteIds.includes('office'));
  });

  test('HTML into a plain-text field becomes clean text', async () => {
    const result = await html('<h2 style="font-size:30px">Plan</h2><ul><li><b>One</b></li><li>Two <a href="https://example.com">link</a></li></ul>', 'plain');
    assert.equal(result.text, 'Plan\n\n• One\n• Two link (https://example.com)');
  });
});

describe('demo samples', () => {
  test('every sample transforms cleanly for every destination', async () => {
    for (const sample of SAMPLES) {
      for (const destination of Object.keys(ADAPTERS) as DestinationId[]) {
        const result = await engine.transform(sample.payload, { destination });
        assertOk(result);
        assert.ok(result.text.trim(), `${sample.id} → ${destination}: empty text`);
        // Already-right content passes through untouched: TSV in a text field, semantic HTML in a semantic editor.
        const alreadyClean = ['sheet-docs→plain', 'resume-template→notion', 'resume-template→rich'].includes(`${sample.id}→${destination}`);
        assert.equal(result.changed, !alreadyClean, `${sample.id} → ${destination}: changed`);
        if (ADAPTERS[destination].mode === 'rich') assert.ok(!/style=|class=|<span|<font/.test(result.html!.replace(/<table border[^>]*>/g, '')), `${sample.id} → ${destination}: leaked styling`);
      }
    }
  });

  test('each sample demonstrates the fix it advertises', async () => {
    const expectations: Record<string, string[]> = {
      'chatgpt-gmail': ['md-emphasis', 'md-links', 'email-spacing'],
      'pdf-docs': ['reflow', 'dehyphenate', 'bullets'],
      'website-slack': ['styles', 'headings-flattened', 'table-as-text'],
      'markdown-docs': ['bullets', 'md-headings', 'md-emphasis', 'blank-lines'],
      'bullets-plain': ['bullets', 'hidden-chars'],
      'gdocs-rich': ['styles', 'blank-lines', 'whitespace'],
      'sheet-docs': ['table'],
      'blog-gmail': ['styles', 'headings-flattened', 'email-spacing'],
      'resume-template': ['headings-flattened'], // its style-matching is covered in style.test.ts
    };
    for (const sample of SAMPLES) {
      const result = await engine.transform(sample.payload, { destination: sample.destination });
      assertOk(result);
      for (const id of expectations[sample.id]) assert.ok(result.noteIds.includes(id), `${sample.id} should report ${id}; got ${result.noteIds}`);
    }
  });
});

describe('test kit specimens', () => {
  test('every specimen transforms safely, in every destination, both adapting and keeping its look', async () => {
    for (const specimen of SPECIMENS) {
      for (const destination of Object.keys(ADAPTERS) as DestinationId[]) {
        for (const mode of ['adapt', 'preserve'] as const) {
          const result = await engine.transform({ html: specimen.html, text: specimen.text }, { destination, mode });
          assertOk(result);
          const out = result.html ?? result.text;
          assert.ok(result.text.trim(), `${specimen.id} → ${destination}/${mode}: empty`);
          assert.doesNotMatch(out, /<script|onerror=|onclick=|onload=|javascript:|<iframe|<form|<input|style="[^"]*background/i, `${specimen.id} → ${destination}/${mode}: unsafe or layout markup`);
          assert.ok(result.ms < 1000, `${specimen.id} took ${result.ms}ms`);
        }
      }
    }
  });
});
