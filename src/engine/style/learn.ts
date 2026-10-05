import { cleanColor, cleanFontFamily, cleanFontSize, cleanLength, cleanLineHeight } from './css';
import type { BlockStyle, RoleStyle, StyleProfile, TextStyle } from './types';

/**
 * Learn a document's look from HTML copied out of it.
 *
 * Google Docs, Word and web pages all put the full formatting on the
 * clipboard when you copy, even when an extension can't read the document
 * itself. From one copied sample (a heading, an entry, a few bullets) we
 * work out what each role looks like.
 */
export function learnStyle(html: string): StyleProfile | null {
  if (!html.trim()) return null;
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const lines = collectLines(dom.body);
  if (!lines.length) return null;

  const profile: StyleProfile = { version: 1 };
  const bodyLine = lines
    .filter((line) => !line.inList && classify(line) === 'body')
    .sort((a, b) => b.text.length - a.text.length)[0];

  for (const line of lines) {
    const role = line.inList ? 'bullet' : classify(line);
    if (role === 'heading' && !profile.heading) {
      const style = dominant(line.runs);
      profile.heading = {
        text: { ...style, bold: line.runs.some((r) => r.style.bold && r.text.trim()) },
        block: line.block,
        caps: /[A-Z]/.test(line.text) && line.text === line.text.toUpperCase(),
        ruleBefore: line.ruleBefore,
        ruleColor: line.ruleColor,
      };
    } else if (role === 'entry' && !profile.entry) {
      const [main, date] = splitAtLastTab(line.runs);
      const base = main.find((r) => !r.style.bold && r.text.trim())?.style ?? dominant(main);
      profile.entry = {
        text: { ...base, bold: false, italic: false },
        block: line.block,
        datesRight: !!date && DATEISH.test(date.map((r) => r.text).join('')),
        dateItalic: !!date?.some((r) => r.style.italic && r.text.trim()),
      };
    } else if (role === 'bullet' && !profile.bullet) {
      profile.bullet = plainRole(line);
    }
  }
  if (bodyLine) profile.body = plainRole(bodyLine);
  return profile.heading || profile.entry || profile.bullet || profile.body ? profile : null;
}

/** Combine what a new sample taught with what was already known: newer roles win. */
export function mergeProfiles(previous: StyleProfile | undefined, next: StyleProfile): StyleProfile {
  return {
    version: 1,
    heading: next.heading ?? previous?.heading,
    entry: next.entry ?? previous?.entry,
    bullet: next.bullet ?? previous?.bullet,
    body: next.body ?? previous?.body,
  };
}

/** One-line summary for the popup: what was learned, in the user's terms. */
export function describeProfile(profile: StyleProfile): string {
  const parts: string[] = [];
  if (profile.heading) {
    const traits = [profile.heading.caps && 'all caps', profile.heading.text.color && !isBlack(profile.heading.text.color) && 'coloured', profile.heading.ruleBefore && 'line above'];
    const detail = traits.filter(Boolean).join(', ');
    parts.push(detail ? `headings (${detail})` : 'headings');
  }
  if (profile.entry) parts.push(profile.entry.datesRight ? 'entries with dates on the right' : 'entry lines');
  if (profile.bullet) parts.push('bullets');
  const font = profile.body?.text ?? profile.bullet?.text;
  if (font?.fontFamily) parts.push(`text in ${font.fontFamily.split(',')[0].replace(/'/g, '')}${font.fontSize ? ` ${font.fontSize}` : ''}`);
  return parts.length ? `Learned ${list(parts)}.` : 'Learned the text style.';
}

// ---------------------------------------------------------------------------

interface Run {
  text: string;
  style: TextStyle;
}

interface Line {
  text: string;
  runs: Run[];
  inList: boolean;
  isHeadingTag: boolean;
  block: BlockStyle;
  ruleBefore: boolean;
  ruleColor?: string;
}

const LINE_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']);
const DATEISH = /\b(19|20)\d{2}\b|\bpresent\b|\bcurrent\b/i;

function declarations(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (el.getAttribute('style') ?? '').split(';')) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

function borderColor(css: Record<string, string>, side: 'top' | 'bottom'): string | undefined {
  const value = css[`border-${side}`];
  if (!value || !/solid|dotted|dashed|double/.test(value)) return undefined;
  const width = /(\d*\.?\d+)\s*(pt|px)/.exec(value);
  if (width && parseFloat(width[1]) === 0) return undefined;
  return cleanColor(/#[0-9a-f]{3,6}\b|rgba?\([^)]*\)/i.exec(value)?.[0]) ?? '#999999';
}

function applyElement(style: TextStyle, el: Element): TextStyle {
  const next = { ...style };
  const tag = el.localName;
  if (tag === 'b' || tag === 'strong' || /^h[1-6]$/.test(tag)) next.bold = true;
  if (tag === 'i' || tag === 'em') next.italic = true;
  const css = declarations(el);
  if (css['font-weight']) next.bold = /bold/.test(css['font-weight']) || Number(css['font-weight']) >= 600;
  if (css['font-style']) next.italic = /italic|oblique/.test(css['font-style']);
  next.fontFamily = cleanFontFamily(css['font-family']) ?? next.fontFamily;
  next.fontSize = cleanFontSize(css['font-size']) ?? next.fontSize;
  next.color = cleanColor(css.color) ?? next.color;
  return next;
}

function styleAt(node: Node, root: Element): TextStyle {
  const chain: Element[] = [];
  for (let el = node.parentElement; el && el !== root.ownerDocument.documentElement; el = el.parentElement) chain.unshift(el);
  return chain.reduce(applyElement, {} as TextStyle);
}

function collectLines(body: HTMLElement): Line[] {
  const lines: Line[] = [];
  let pendingRule: string | undefined;
  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);

  for (let el = walker.nextNode() as Element | null; el; el = walker.nextNode() as Element | null) {
    if (el.localName === 'hr') {
      pendingRule = cleanColor(declarations(el)['border-top-color'] ?? declarations(el).color) ?? '#999999';
      continue;
    }
    if (!LINE_TAGS.has(el.localName)) continue;
    if (el.localName === 'li' && el.querySelector(':scope > p, :scope > h1, :scope > h2, :scope > h3')) continue;

    const css = declarations(el);
    const runs = runsOf(el);
    const text = runs.map((r) => r.text).join('').replace(/\u00a0/g, ' ').replace(/^ +| +$/g, '');
    const below = borderColor(css, 'bottom');
    if (!text.trim()) {
      if (below) pendingRule = below;
      continue;
    }
    const above = borderColor(css, 'top');
    lines.push({
      text,
      runs,
      inList: !!el.closest('li') || /mso-list/.test(el.getAttribute('style') ?? ''),
      isHeadingTag: /^h[1-6]$/.test(el.localName),
      block: {
        marginTop: cleanLength(css['margin-top']),
        marginBottom: cleanLength(css['margin-bottom']),
        lineHeight: cleanLineHeight(css['line-height']),
      },
      ruleBefore: !!(pendingRule || above),
      ruleColor: pendingRule ?? above,
    });
    pendingRule = below;
  }
  return lines;
}

function runsOf(line: Element): Run[] {
  const runs: Run[] = [];
  const walker = line.ownerDocument.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest('li') !== line.closest('li') || parent.closest('ul, ol') !== line.closest('ul, ol')) continue;
    if (/display\s*:\s*none|mso-list\s*:\s*ignore/i.test(parent.closest('[style]')?.getAttribute('style') ?? '')) continue;
    runs.push({ text: node.textContent ?? '', style: styleAt(node, line) });
  }
  return runs;
}

function classify(line: Line): 'heading' | 'entry' | 'body' {
  const words = line.text.trim().split(/\s+/).length;
  const visible = line.runs.filter((r) => r.text.trim());
  const allBold = visible.every((r) => r.style.bold);
  const caps = /[A-Z]/.test(line.text) && line.text === line.text.toUpperCase();
  if ((line.isHeadingTag || allBold || caps) && words <= 6 && line.text.length <= 60 && !/[.;]$/.test(line.text) && !line.text.includes('\t')) {
    return 'heading';
  }
  if (visible[0]?.style.bold && visible.some((r) => !r.style.bold) && line.text.length <= 220) return 'entry';
  return 'body';
}

function dominant(runs: Run[]): TextStyle {
  const best = [...runs].sort((a, b) => b.text.trim().length - a.text.trim().length)[0];
  return { ...(best?.style ?? {}) };
}

function plainRole(line: Line): RoleStyle {
  return { text: { ...dominant(line.runs), bold: false, italic: false }, block: line.block };
}

function splitAtLastTab(runs: Run[]): [Run[], Run[] | undefined] {
  for (let i = runs.length - 1; i >= 0; i--) {
    const tab = runs[i].text.lastIndexOf('\t');
    if (tab === -1) continue;
    const before = { ...runs[i], text: runs[i].text.slice(0, tab) };
    const after = { ...runs[i], text: runs[i].text.slice(tab + 1) };
    return [[...runs.slice(0, i), before], [after, ...runs.slice(i + 1)].filter((r) => r.text)];
  }
  return [runs, undefined];
}

function isBlack(color: string): boolean {
  return color === '#000000' || color === '#222222';
}

function list(parts: string[]): string {
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
