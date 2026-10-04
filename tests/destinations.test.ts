import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { detectDestination, detectSource, type PasteTarget } from '../src/engine';
import { fingerprint, matchOrigin, siteName } from '../src/extension/origin';

const target = (overrides: Partial<PasteTarget>): PasteTarget => ({
  hostname: 'example.com',
  kind: 'rich',
  singleLine: false,
  codeEditor: false,
  ...overrides,
});

describe('destination detection', () => {
  test('known sites map to their adapters', () => {
    assert.equal(detectDestination(target({ hostname: 'mail.google.com' }))?.id, 'gmail');
    assert.equal(detectDestination(target({ hostname: 'app.slack.com' }))?.id, 'slack');
    assert.equal(detectDestination(target({ hostname: 'www.notion.so' }))?.id, 'notion');
    assert.equal(detectDestination(target({ hostname: 'docs.google.com' }))?.id, 'google-docs');
    assert.equal(detectDestination(target({ hostname: 'example.com' }))?.id, 'rich');
  });

  test('form fields are always plain text, even on rich sites', () => {
    assert.equal(detectDestination(target({ hostname: 'mail.google.com', kind: 'input', singleLine: true }))?.id, 'plain');
    assert.equal(detectDestination(target({ kind: 'textarea' }))?.id, 'plain');
    assert.equal(detectDestination(target({ kind: 'plaintext-editable' }))?.id, 'plain');
  });

  test('code editors are never touched', () => {
    assert.equal(detectDestination(target({ codeEditor: true })), null);
    assert.equal(detectDestination(target({ kind: 'textarea', codeEditor: true })), null);
  });

  test('destination-aware formatting can be turned off', () => {
    assert.equal(detectDestination(target({ hostname: 'app.slack.com' }), false)?.id, 'rich');
  });

  test('pages can declare their destination; unknown values are ignored', () => {
    assert.equal(detectDestination(target({ override: 'slack' }))?.id, 'slack');
    assert.equal(detectDestination(target({ override: 'nonsense' }))?.id, 'rich');
  });
});

describe('content detection', () => {
  test('identifies sources', () => {
    assert.equal(detectSource({ text: '' }).kind, 'empty');
    assert.equal(detectSource({ text: '**bold** text' }).label, 'Markdown');
    assert.equal(detectSource({ text: 'a\tb\nc\td' }).label, 'Spreadsheet');
    assert.equal(detectSource({ text: 'hello there' }).label, 'Plain text');
    assert.equal(detectSource({ html: '<b id="docs-internal-guid-1">x</b>', text: 'x' }).label, 'Google Docs');
    assert.equal(detectSource({ html: '<p class=MsoNormal>x</p>', text: 'x' }).label, 'Microsoft Word');
    assert.equal(detectSource({ html: '<p>Hello <b>web</b></p>', text: 'Hello web' }).label, 'Web page');
  });

  test('indented lists are not mistaken for spreadsheets', () => {
    assert.notEqual(detectSource({ text: 'List\n\t– one\n\t– two' }).label, 'Spreadsheet');
  });

  test('HTML that only wraps Markdown text defers to the Markdown', () => {
    const source = detectSource({ html: '<meta charset="utf-8"><div><span># Title</span><br><span>**bold**</span></div>', text: '# Title\n**bold**' });
    assert.equal(source.kind, 'markdown');
  });

  test('empty HTML falls back to text', () => {
    assert.equal(detectSource({ html: '<meta charset="utf-8"><span></span>', text: 'plain' }).kind, 'text');
  });
});

describe('copy origin', () => {
  test('fingerprints survive whitespace and bullet differences', () => {
    assert.equal(fingerprint('• Workout\n• Build   project'), fingerprint('Workout\nBuild project'));
    assert.notEqual(fingerprint('Workout'), fingerprint('Workday'));
    assert.equal(fingerprint('  '), '');
  });

  test('matches a recent copy and ignores stale ones', () => {
    const origin = { fingerprint: fingerprint('Hello world'), site: 'ChatGPT', at: 1_000 };
    assert.equal(matchOrigin(origin, 'Hello world', 2_000), 'ChatGPT');
    assert.equal(matchOrigin(origin, 'Something else', 2_000), undefined);
    assert.equal(matchOrigin(origin, 'Hello world', 1_000 + 31 * 60_000), undefined);
  });

  test('names well-known sites', () => {
    assert.equal(siteName('chatgpt.com'), 'ChatGPT');
    assert.equal(siteName('en.wikipedia.org'), 'Wikipedia');
    assert.equal(siteName('www.example.org'), 'example.org');
  });
});
