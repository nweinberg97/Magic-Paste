import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { transform, type DestinationId, type TransformOptions } from '../src/engine';

// Plain text and Markdown never touch the DOM, so these run directly in Node.

function run(text: string, destination: DestinationId = 'rich', options: Partial<TransformOptions> = {}) {
  const result = transform({ text }, { destination, ...options });
  assert.ok(result.ok, `expected ok, got ${JSON.stringify(result)}`);
  return result;
}

const ids = (result: ReturnType<typeof run>) => result.notes.map((note) => note.id);

describe('whitespace', () => {
  test('collapses runs of spaces inside lines', () => {
    const result = run('Email    candidates   today', 'plain');
    assert.equal(result.text, 'Email candidates today');
    assert.ok(ids(result).includes('whitespace'));
  });

  test('removes extra blank lines but keeps paragraph breaks', () => {
    const result = run('\n\nFirst paragraph.\n\n\n\nSecond paragraph.\n\n\n', 'plain');
    assert.equal(result.text, 'First paragraph.\n\nSecond paragraph.');
    assert.ok(result.notes.find((n) => n.id === 'blank-lines')!.count >= 4);
  });

  test('removes invisible characters and normalizes non-breaking spaces', () => {
    const zwsp = String.fromCharCode(0x200b);
    const nbsp = String.fromCharCode(0xa0);
    const result = run(`Hello${zwsp} world${nbsp}${nbsp}again`, 'plain');
    assert.equal(result.text, 'Hello world again');
    assert.ok(ids(result).includes('hidden-chars'));
  });
});

describe('bullets', () => {
  test('turns malformed bullets into a real list', () => {
    const result = run('• Workout\n•    Build project\n•Email candidates');
    assert.equal(result.html, '<ul><li>Workout</li><li>Build project</li><li>Email candidates</li></ul>');
    assert.equal(result.notes.find((n) => n.id === 'bullets')?.count, 3);
  });

  test('handles the common bullet glyphs', () => {
    for (const glyph of ['•', '◦', '▪', '●', '‣']) {
      const result = run(`${glyph} one\n${glyph} two`);
      assert.equal(result.html, '<ul><li>one</li><li>two</li></ul>', glyph);
    }
    assert.equal(run('– one\n– two').html, '<ul><li>one</li><li>two</li></ul>');
    assert.equal(run('* one\n* two').html, '<ul><li>one</li><li>two</li></ul>');
  });

  test('a single dash-led line stays prose', () => {
    const result = run('— Ada Lovelace');
    assert.equal(result.html, '<p>— Ada Lovelace</p>');
    assert.equal(result.changed, false);
  });

  test('nests by indentation', () => {
    const result = run('- Build project\n  - write tests\n  - record demo\n- Ship');
    assert.equal(result.html, '<ul><li>Build project<ul><li>write tests</li><li>record demo</li></ul></li><li>Ship</li></ul>');
  });

  test('nests by bullet glyph when indentation was lost (PDF, Word)', () => {
    const result = run('• Travel\n◦ Flights\n◦ Hotel\n• Budget');
    assert.equal(result.html, '<ul><li>Travel<ul><li>Flights</li><li>Hotel</li></ul></li><li>Budget</li></ul>');
  });

  test('joins wrapped continuation lines into the item', () => {
    const result = run('• Meeting load fell most for engineers, and least for\n  managers, who kept routing information.\n• Second point');
    assert.equal(
      result.html,
      '<ul><li>Meeting load fell most for engineers, and least for managers, who kept routing information.</li><li>Second point</li></ul>',
    );
  });

  test('renders clean plain-text bullets with nesting', () => {
    const result = run('•Laptop\n•     HDMI adapter\n    ◦ spare cable', 'plain');
    assert.equal(result.text, '• Laptop\n• HDMI adapter\n  ◦ spare cable');
  });
});

describe('numbered lists', () => {
  test('rebuilds plain-text numbering as an ordered list', () => {
    const result = run('1) Draft\n2) Review\n3) Publish');
    assert.equal(result.html, '<ol><li>Draft</li><li>Review</li><li>Publish</li></ol>');
    assert.ok(ids(result).includes('numbering'));
  });

  test('keeps a custom start number', () => {
    assert.equal(run('4. Four\n5. Five').html, '<ol start="4"><li>Four</li><li>Five</li></ol>');
  });

  test('puts bullets under numbered steps', () => {
    const result = run('1. Prepare\n- buy paint\n2. Paint');
    assert.equal(result.html, '<ol><li>Prepare<ul><li>buy paint</li></ul></li><li>Paint</li></ol>');
  });

  test('renumbers sequentially in plain text', () => {
    assert.equal(run('1. a\n1. b\n1. c', 'plain').text, '1. a\n2. b\n3. c');
  });
});

describe('markdown', () => {
  test('converts bold, italic, code and strike', () => {
    const result = run('This is **important**, *subtle*, `npm test` and ~~old~~.');
    assert.equal(result.html, '<p>This is <strong>important</strong>, <em>subtle</em>, <code>npm test</code> and <s>old</s>.</p>');
    assert.ok(ids(result).includes('md-emphasis'));
  });

  test('converts links and keeps the author’s URL', () => {
    const result = run('[Read more](https://example.com) and **more**');
    assert.equal(result.html, '<p><a href="https://example.com">Read more</a> and <strong>more</strong></p>');
    assert.equal(result.notes.find((n) => n.id === 'md-links')?.count, 1);
  });

  test('converts headings, quotes, fences and tables', () => {
    const md = '# Title\n\n## Section\n\n> quoted **text**\n\n```\nconst x = 1;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
    const result = run(md);
    assert.equal(
      result.html,
      '<h1>Title</h1><h2>Section</h2><blockquote><p>quoted <strong>text</strong></p></blockquote>' +
        '<pre><code>const x = 1;</code></pre><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
  });

  test('keeps Markdown literal (but tidy) for plain-text destinations', () => {
    const result = run('# Plan\n\n\n- one\n-   two\n\nThis is **bold** and [a link](https://example.com).', 'plain');
    assert.equal(result.text, '# Plan\n\n- one\n- two\n\nThis is **bold** and [a link](https://example.com).');
    assert.ok(ids(result).includes('kept-markdown'));
  });

  test('mixed formatting inside list items', () => {
    const result = run('- **Back off** using [exponential delay](https://example.com/backoff)\n- Retry *once*');
    assert.equal(
      result.html,
      '<ul><li><strong>Back off</strong> using <a href="https://example.com/backoff">exponential delay</a></li><li>Retry <em>once</em></li></ul>',
    );
  });

  test('bold link text stays one link', () => {
    assert.equal(run('**[Docs](https://example.com)** today').html, '<p><a href="https://example.com"><strong>Docs</strong></a> today</p>');
  });

  test('respects backslash escapes', () => {
    assert.equal(run('Use \\*literal\\* stars and **bold**').html, '<p>Use *literal* stars and <strong>bold</strong></p>');
  });
});

describe('plain text is not over-interpreted', () => {
  test('no headings are guessed from plain text', () => {
    const result = run('#1 priority this week\nShip the release');
    assert.equal(result.html, '<p>#1 priority this week<br>Ship the release</p>');
  });

  test('arithmetic is not emphasis', () => {
    const result = run('Compute 5 * 3 * 2 for the total.');
    assert.equal(result.html, '<p>Compute 5 * 3 * 2 for the total.</p>');
  });

  test('already-clean text is reported unchanged so paste passes through', () => {
    assert.equal(run('Just a normal sentence.', 'plain').changed, false);
    assert.equal(run('Just a normal sentence.', 'rich').changed, false);
  });

  test('short lines like addresses keep their line breaks', () => {
    assert.equal(run('Ada Lovelace\n12 St James Square\nLondon').html, '<p>Ada Lovelace<br>12 St James Square<br>London</p>');
  });

  test('bare URLs become links', () => {
    assert.equal(run('See https://example.com/docs.').html, '<p>See <a href="https://example.com/docs">https://example.com/docs</a>.</p>');
  });
});

describe('PDF-style hard wraps', () => {
  const pdf =
    'Distributed teams that adopted written decision records reported fewer\n' +
    'meetings and faster onboarding. The effect was strongest when the prac-\n' +
    'tice was introduced early, before team norms had formed.\n' +
    'Methods\n' +
    'We surveyed 412 participants across eleven companies in three different\n' +
    'countries over two years.';

  test('rejoins wrapped lines, fixes hyphenation, keeps short titles separate', () => {
    const result = run(pdf, 'rich');
    assert.equal(
      result.html,
      '<p>Distributed teams that adopted written decision records reported fewer meetings and faster onboarding. ' +
        'The effect was strongest when the practice was introduced early, before team norms had formed.</p>' +
        '<p>Methods</p><p>We surveyed 412 participants across eleven companies in three different countries over two years.</p>',
    );
    assert.ok(ids(result).includes('reflow'));
    assert.equal(result.notes.find((n) => n.id === 'dehyphenate')?.count, 1);
  });
});

describe('spreadsheet rows', () => {
  test('tab-separated rows become a table with a header', () => {
    const result = run('Name\tRole\nAna\tDesigner\nMarcus\tEngineer');
    assert.equal(
      result.html,
      '<table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody><tr><td>Ana</td><td>Designer</td></tr><tr><td>Marcus</td><td>Engineer</td></tr></tbody></table>',
    );
    assert.equal(result.source.label, 'Spreadsheet');
  });

  test('numeric first rows are not mistaken for headers', () => {
    const result = run('2024\t10\n2025\t12');
    assert.ok(result.html?.startsWith('<table><tbody>'));
  });

  test('stay tab-separated in plain text', () => {
    assert.equal(run('a\tb\nc\td', 'plain').text, 'a\tb\nc\td');
  });

  test('pads rows that dropped trailing empty cells', () => {
    const result = run('Name\tRole\tTeam\nAna\tDesigner\nMarcus\tEngineer\tCore');
    assert.match(result.html!, /<tr><td>Ana<\/td><td>Designer<\/td><td><\/td><\/tr>/);
  });
});

describe('edge cases', () => {
  test('empty input is a no-op', () => {
    assert.deepEqual(transform({ text: '' }, { destination: 'rich' }), { ok: false, reason: 'empty' });
    assert.deepEqual(transform({ text: '   \n\n ' }, { destination: 'plain' }), { ok: false, reason: 'empty' });
    assert.deepEqual(transform({}, { destination: 'gmail' }), { ok: false, reason: 'empty' });
  });

  test('oversized input is left alone', () => {
    const result = transform({ text: 'x'.repeat(1_100_000) }, { destination: 'rich' });
    assert.deepEqual(result, { ok: false, reason: 'too-large' });
  });

  test('single-line inputs get one line', () => {
    const result = run('Line one\n\nLine two', 'plain', { singleLine: true });
    assert.equal(result.text, 'Line one Line two');
    assert.ok(ids(result).includes('single-line'));
  });

  test('Windows line endings', () => {
    assert.equal(run('• one\r\n• two\r\n', 'plain').text, '• one\n• two');
  });
});
