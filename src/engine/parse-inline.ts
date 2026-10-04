import { text, type Inline, type Marks } from './model';
import type { Report } from './report';
import { safeUrl } from './sanitize';

interface InlineOptions {
  markdown: boolean;
  report: Report;
}

// Order matters: at the same position the earliest alternative wins, so code
// spans and escapes shield their contents from emphasis and link parsing.
const MARKDOWN_TOKENS = [
  String.raw`\\(?<escaped>[\\\x60*_{}\[\]()#+\-.!~|>])`,
  String.raw`\x60(?<code>[^\x60\n]+)\x60`,
  String.raw`\[(?<linkText>[^\]\n]+)\]\(\s*<?(?<linkHref>[^)\s>]+)>?(?:\s+["'][^"'\n]*["'])?\s*\)`,
  String.raw`\*\*(?=\S)(?<bold>[^\n]*?\S)\*\*`,
  String.raw`__(?=\S)(?<bold2>[^\n]*?\S)__(?!\w)`,
  String.raw`~~(?=\S)(?<strike>[^\n]*?\S)~~`,
  String.raw`(?<![*\w])\*(?=[^\s*])(?<italic>[^*\n]*?[^\s*])\*(?![*\w])`,
  String.raw`(?<![\w_])_(?=[^\s_])(?<italic2>[^_\n]*?[^\s_])_(?![\w_])`,
];

const LINK_TOKENS = [
  String.raw`<(?<angle>(?:https?:\/\/|mailto:)[^>\s]+)>`,
  String.raw`(?<![\w@/])(?<url>(?:https?:\/\/|www\.)[^\s<>"'\x60]+)`,
];

const WITH_MARKDOWN = new RegExp([...MARKDOWN_TOKENS, ...LINK_TOKENS].join('|'), 'g');
const LINKS_ONLY = new RegExp(LINK_TOKENS.join('|'), 'g');

/** Parse one run of prose into inline nodes (bold, italic, code, links). */
export function parseInline(source: string, options: InlineOptions, marks: Marks = {}): Inline[] {
  const out: Inline[] = [];
  const pattern = new RegExp(options.markdown ? WITH_MARKDOWN : LINKS_ONLY);
  let cursor = 0;

  const pushText = (value: string, extra: Marks = {}) => {
    if (value) out.push(text(value, { ...marks, ...extra }));
  };

  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const groups = match.groups ?? {};
    let consumed = match[0];
    pushText(source.slice(cursor, match.index));

    if (groups.escaped !== undefined) {
      pushText(groups.escaped);
    } else if (groups.code !== undefined) {
      pushText(groups.code, { code: true });
      options.report.add('md-emphasis');
    } else if (groups.linkText !== undefined) {
      const href = marks.href ? null : safeUrl(groups.linkHref);
      if (href) options.report.add('md-links');
      out.push(...parseInline(groups.linkText, options, href ? { ...marks, href } : marks));
    } else if (groups.bold !== undefined || groups.bold2 !== undefined) {
      options.report.add('md-emphasis');
      out.push(...parseInline(groups.bold ?? groups.bold2, options, { ...marks, bold: true }));
    } else if (groups.strike !== undefined) {
      options.report.add('md-emphasis');
      out.push(...parseInline(groups.strike, options, { ...marks, strike: true }));
    } else if (groups.italic !== undefined || groups.italic2 !== undefined) {
      options.report.add('md-emphasis');
      out.push(...parseInline(groups.italic ?? groups.italic2, options, { ...marks, italic: true }));
    } else {
      // Bare or angle-bracketed URL. Trailing sentence punctuation is not part of it.
      let raw = groups.angle ?? groups.url;
      if (groups.url !== undefined) {
        raw = trimUrl(raw);
        consumed = raw;
        pattern.lastIndex = match.index + raw.length;
      }
      const href = marks.href ? null : safeUrl(raw);
      pushText(raw, href ? { href } : {});
    }
    cursor = match.index + consumed.length;
  }
  pushText(source.slice(cursor));
  return out;
}

function trimUrl(url: string): string {
  let result = url.replace(/[.,;:!?*_~]+$/, '');
  // Drop an unbalanced closing paren: "(see https://example.com)".
  while (result.endsWith(')') && count(result, '(') < count(result, ')')) result = result.slice(0, -1);
  return result;
}

function count(value: string, ch: string): number {
  return value.split(ch).length - 1;
}
