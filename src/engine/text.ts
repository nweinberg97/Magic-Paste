import type { Report } from './report';

/**
 * Zero-width space, word joiner, BOM and soft hyphen: invisible noise from
 * PDFs, CMSs and editors. Zero-width joiners (U+200C/U+200D) are kept: they
 * hold emoji sequences like 👩🏽‍💻 together and matter in Persian and Indic text.
 */
const INVISIBLE = /[\u200B\u2060\uFEFF\u00AD]/g;
/** Non-breaking and other fixed-width spaces that render as stubborn gaps. */
const ODD_SPACES = /[\u00A0\u2007\u202F\u2009\u200A\u3000]/g;

/** Character-level cleanup shared by every text path. */
export function cleanCharacters(input: string, report?: Report): string {
  let hidden = 0;
  const out = input
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(INVISIBLE, () => {
      hidden++;
      return '';
    })
    // Visible gaps, not hidden characters: collapseSpaces() reports any runs they form.
    .replace(ODD_SPACES, ' ');
  report?.add('hidden-chars', hidden);
  return out;
}

/** Collapse runs of spaces/tabs inside a line of prose. */
export function collapseSpaces(value: string, report?: Report): string {
  let runs = 0;
  const out = value.replace(/[ \t]{2,}/g, () => {
    runs++;
    return ' ';
  });
  report?.add('whitespace', runs);
  return out;
}

const STRONG_MARKDOWN = [
  /\*\*[^*\n]+\*\*/, // **bold**
  /__[^_\n]+__/, // __bold__
  /\[[^\]\n]+\]\((?:https?:|mailto:|www\.)[^)\s]+\)/, // [text](url)
  /^#{1,6}[ \t]+\S/m, // # heading
  /^```/m, // fenced code
  /^\|.+\|[ \t]*\n\|?[ \t]*:?-{3,}/m, // pipe table
];

const WEAK_MARKDOWN = [
  /(^|\s)\*[^\s*][^*\n]*\*(?=\s|[.,;:!?]|$)/m, // *italic*
  /(^|\s)_[^\s_][^_\n]*_(?=\s|[.,;:!?]|$)/m, // _italic_
  /`[^`\n]+`/, // `code`
  /^>[ \t]+\S/m, // > quote
  /^[ \t]*[-*+][ \t]+\S/m, // - list
  /^[ \t]*\d{1,3}\.[ \t]+\S/m, // 1. list
];

/**
 * Markdown is only interpreted with a strong signal, so plain text that happens
 * to contain "#1 priority" or "5 * 3" is never mangled.
 */
export function looksLikeMarkdown(input: string): boolean {
  if (STRONG_MARKDOWN.some((re) => re.test(input))) return true;
  const weak = WEAK_MARKDOWN.filter((re) => re.test(input)).length;
  return weak >= 3;
}
