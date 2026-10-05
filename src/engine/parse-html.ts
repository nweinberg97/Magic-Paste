import { buildLists, type FlatItem } from './lists';
import type { Block, Doc, HeadingLevel, Inline, Marks, SourceFont } from './model';
import type { Report } from './report';
import { safeImageSrc, safeUrl } from './sanitize';
import { cleanColor, cleanFontFamily, cleanFontSize } from './style/css';
import { cleanCharacters } from './text';

/**
 * Clipboard HTML → document model.
 *
 * The browser's own parser does the hard work (and repairs malformed markup).
 * We then walk the tree and keep only meaning — structure, emphasis, links —
 * never the source's CSS, classes or attributes.
 */
export function parseHtml(html: string, report: Report): Doc {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  auditSource(dom, html, report);
  return { blocks: new HtmlWalker(report).blocks(dom.body, {}) };
}

const DROP = new Set([
  'script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'title', 'iframe', 'object', 'embed', 'svg',
  'canvas', 'video', 'audio', 'button', 'input', 'select', 'option', 'textarea', 'map', 'area', 'dialog',
]);

const BLOCKS = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'figure', 'figcaption', 'address',
  'center', 'details', 'summary', 'form', 'fieldset', 'legend', 'dl', 'dt', 'dd', 'li', 'ul', 'ol', 'table', 'pre',
  'blockquote', 'hr', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'html',
]);

const CONTROLS = new Set(['button', 'input', 'select', 'textarea']);

const MONOSPACE = /monospace|courier|consolas|menlo|monaco|sf mono|source code/i;

function auditSource(dom: Document, raw: string, report: Report): void {
  let unsafe = dom.querySelectorAll('script, iframe, object, embed').length;
  let styled = dom.querySelectorAll('font, [style], [class], [face], [color], [bgcolor]').length;
  for (const el of Array.from(dom.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) unsafe++;
    }
  }
  unsafe += Array.from(dom.querySelectorAll('a[href]')).filter((a) =>
    /^\s*(javascript|data|vbscript):/i.test(a.getAttribute('href') ?? ''),
  ).length;
  if (dom.querySelector('style')) styled++;
  report.add('unsafe', unsafe ? 1 : 0);
  report.add('styles', styled ? 1 : 0);
  if (/urn:schemas-microsoft-com|mso-|<o:p>/i.test(raw)) report.add('office');
}

function style(el: Element): string {
  return (el.getAttribute('style') ?? '').toLowerCase();
}

function isHidden(el: Element): boolean {
  const css = style(el);
  return (
    el.hasAttribute('hidden') ||
    el.getAttribute('aria-hidden') === 'true' ||
    /display\s*:\s*none|visibility\s*:\s*hidden|mso-list\s*:\s*ignore/.test(css) ||
    /\b(sr-only|visually-hidden|screen-reader-text)\b/.test(el.getAttribute('class') ?? '')
  );
}

function hasBlockDescendant(el: Element): boolean {
  return Array.from(el.querySelectorAll('*')).some((child) => BLOCKS.has(child.localName));
}

/** Word encodes lists as styled paragraphs: <p style="mso-list:l0 level2 lfo1">. */
function wordListLevel(el: Element): number | null {
  const match = /mso-list\s*:\s*l\d+\s+level(\d+)/.exec(style(el));
  return match ? Number(match[1]) - 1 : null;
}

function marksFor(el: Element, marks: Marks, report?: Report): Marks {
  const next: Marks = { ...marks };
  const tag = el.localName;
  const css = style(el);

  if (tag === 'b' || tag === 'strong') next.bold = true;
  if (tag === 'i' || tag === 'em') next.italic = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') next.strike = true;
  if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') next.code = true;

  // Inline CSS overrides tags, e.g. Google Docs wraps everything in <b style="font-weight:normal">.
  const weight = /font-weight\s*:\s*(\w+)/.exec(css)?.[1];
  if (weight) next.bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
  const fontStyle = /font-style\s*:\s*(\w+)/.exec(css)?.[1];
  if (fontStyle) next.italic = fontStyle === 'italic' || fontStyle === 'oblique';
  if (/text-decoration[^;]*line-through/.test(css)) next.strike = true;
  const family = /font-family\s*:\s*([^;]+)/.exec(css)?.[1];
  if (family && MONOSPACE.test(family)) next.code = true;

  if (tag === 'a') {
    const href = safeUrl(el.getAttribute('href'));
    if (href) next.href = href;
  }

  const font = sourceFont(el, css, report);
  if (font) next.font = { ...marks.font, ...font };
  return next;
}

/**
 * The run's own look, kept for blank destinations, minus the malfunctions:
 * light text from dark pages that would vanish on white, drop caps and
 * other oversized letters. Backgrounds and layout are never carried.
 */
function sourceFont(el: Element, css: string, report?: Report): SourceFont | undefined {
  const declared = (name: string) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(css)?.[1];
  const font: SourceFont = {};

  // Family names keep their original capitalisation (the lowercased css is fine for everything else).
  const rawFamily = /(?:^|;)\s*font-family\s*:\s*([^;]+)/i.exec(el.getAttribute('style') ?? '')?.[1];
  const family = cleanFontFamily(rawFamily ?? el.getAttribute('face') ?? undefined);
  if (family) font.family = family;

  const size = cleanFontSize(declared('font-size'));
  if (size) {
    const points = parseFloat(size) * (size.endsWith('px') ? 0.75 : 1);
    if (/float\s*:\s*(left|right)/.test(css) || points > 40) report?.add('oversized');
    else font.size = size;
  }

  const color = cleanColor(declared('color') ?? el.getAttribute('color') ?? undefined);
  if (color) {
    // Below 2.5:1 on white, text designed for a dark page is unreadable once pasted.
    if (contrastOnWhite(color) < 2.5) report?.add('invisible-text');
    else font.color = color;
  }
  return Object.keys(font).length ? font : undefined;
}

function contrastOnWhite(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (luminance + 0.05);
}

class HtmlWalker {
  constructor(private readonly report: Report) {}

  /** Block content of a container; loose inline content becomes paragraphs. */
  blocks(parent: Element, marks: Marks): Block[] {
    const out: Block[] = [];
    let inline: Inline[] = [];
    let wordList: FlatItem[] = [];

    const flushInline = () => {
      if (inline.some((node) => node.type === 'text' && node.text.trim())) {
        out.push({ type: 'paragraph', content: inline });
      } else {
        // Stray <br>s and empty spans between blocks are spacing noise.
        this.report.add('blank-lines', inline.filter((node) => node.type === 'break').length);
      }
      inline = [];
    };
    const flushWordList = () => {
      if (wordList.length) out.push(...buildLists(wordList));
      wordList = [];
    };

    // Flex and grid children sit apart on screen even with no whitespace between them in the HTML.
    const spaced = /display\s*:\s*(inline-)?(flex|grid)/.test(style(parent));
    for (const node of Array.from(parent.childNodes)) {
      if (spaced && node.nodeType === Node.ELEMENT_NODE && inline.length) inline.push({ type: 'text', text: ' ', marks: {} });
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent?.trim()) flushWordList();
        inline.push(...this.textNode(node, marks));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as Element;
      if (el.localName === 'br') {
        inline.push({ type: 'break' });
        continue;
      }
      if (DROP.has(el.localName) || isHidden(el)) {
        // A removed button between two words shouldn't glue them together.
        if (CONTROLS.has(el.localName)) inline.push({ type: 'text', text: ' ', marks: {} });
        continue;
      }

      const wordLevel = wordListLevel(el);
      if (wordLevel !== null) {
        flushInline();
        const marker = el.querySelector('[style*="mso-list:Ignore" i], [style*="mso-list: Ignore" i]')?.textContent ?? '';
        const content = this.inline(el, marks);
        const typed = stripListMarker(content);
        wordList.push({
          level: wordLevel,
          ordered: /^\(?[0-9a-z]{1,4}[.)]/i.test((marker || typed).trim()),
          content,
        });
        continue;
      }
      flushWordList();

      if (BLOCKS.has(el.localName) || hasBlockDescendant(el)) {
        flushInline();
        out.push(...this.block(el, marks));
      } else {
        inline.push(...this.inline(el, marks, true));
      }
    }
    flushInline();
    flushWordList();
    return out;
  }

  private block(el: Element, inherited: Marks): Block[] {
    const tag = el.localName;
    // Code keeps its own text only: editor themes (dark backgrounds, token colours) aren't carried.
    if (tag === 'pre' || this.isCodeBlock(el)) return [{ type: 'code', text: codeText(el) }];
    // A block's own inline style (its font, size, colour) applies to everything inside it.
    const marks = marksFor(el, inherited, this.report);

    if (/^h[1-6]$/.test(tag)) {
      const level = Math.min(Number(tag[1]), 3) as HeadingLevel;
      // Headings are already bold; bold inside them is source noise.
      const content = this.inline(el, { ...marks, bold: false }).map((node) =>
        node.type === 'text' ? { ...node, marks: { ...node.marks, bold: false } } : node,
      );
      return [{ type: 'heading', level, content }];
    }
    if (tag === 'ul' || tag === 'ol') {
      const items: FlatItem[] = [];
      this.listItems(el, 0, marks, items);
      return buildLists(items);
    }
    if (tag === 'blockquote') return [{ type: 'quote', children: this.blocks(el, marks) }];
    if (tag === 'hr') return [{ type: 'rule' }];
    if (tag === 'img') return this.image(el);
    if (tag === 'table') return this.table(el, marks);
    return this.blocks(el, marks);
  }

  /** Editors like VS Code copy code as styled divs rather than <pre>. */
  private isCodeBlock(el: Element): boolean {
    const css = style(el);
    return /white-space\s*:\s*pre/.test(css) && MONOSPACE.test(/font-family\s*:\s*([^;]+)/.exec(css)?.[1] ?? '');
  }

  private listItems(list: Element, level: number, marks: Marks, out: FlatItem[]): void {
    const ordered = list.localName === 'ol';
    let start = Number(list.getAttribute('start')) || 1;
    for (const child of Array.from(list.children)) {
      if (DROP.has(child.localName) || isHidden(child)) continue;
      if (child.localName === 'ul' || child.localName === 'ol') {
        this.listItems(child, level + 1, marks, out); // malformed but common: <ul><ul>…</ul></ul>
        continue;
      }
      // Google Docs flattens nesting into aria-level on each <li>.
      const ariaLevel = Number(child.getAttribute('aria-level'));
      const itemLevel = ariaLevel > 0 ? ariaLevel - 1 : level;
      out.push({ level: itemLevel, ordered, start: start++, content: this.inline(child, marksFor(child, marks, this.report), false, true) });
      for (const nested of Array.from(child.querySelectorAll(':scope > ul, :scope > ol, :scope > div > ul, :scope > div > ol'))) {
        this.listItems(nested, itemLevel + 1, marks, out);
      }
    }
  }

  private table(el: Element, marks: Marks): Block[] {
    const table = el as HTMLTableElement;
    const rows = Array.from(table.rows).filter((row) => row.closest('table') === table);
    const width = Math.max(0, ...rows.map((row) => Array.from(row.cells).reduce((n, cell) => n + Math.max(1, cell.colSpan), 0)));
    // Layout tables (one row or column, or tables of tables, like email signatures) are containers, not data.
    if (width < 2 || rows.length < 2 || table.querySelector('table')) {
      return rows.flatMap((row) => Array.from(row.cells).flatMap((cell) => this.blocks(cell, marksFor(cell, marks, this.report))));
    }

    // Expand merged cells into a regular grid so columns stay aligned.
    const grid: Inline[][][] = rows.map(() => []);
    rows.forEach((row, r) => {
      let c = 0;
      for (const cell of Array.from(row.cells)) {
        while (grid[r][c]) c++;
        grid[r][c] = this.inline(cell, marksFor(cell, marks, this.report));
        for (let dr = 0; dr < Math.max(1, cell.rowSpan); dr++) {
          for (let dc = 0; dc < Math.max(1, cell.colSpan); dc++) {
            if ((dr || dc) && grid[r + dr]) grid[r + dr][c + dc] = [];
          }
        }
        c += Math.max(1, cell.colSpan);
      }
    });
    const cells = grid
      .map((row) => Array.from({ length: width }, (_, c) => row[c] ?? []))
      .filter((row) => row.some((cell) => cell.some((node) => node.type === 'text' && node.text.trim())));
    if (!cells.length) return [];

    const first = rows[0];
    const firstCells = Array.from(first.cells);
    const boldRow = cells[0].every((cell) => cell.every((node) => node.type !== 'text' || !node.text.trim() || node.marks.bold));
    const header = first.parentElement?.localName === 'thead' || firstCells.every((c) => c.localName === 'th') || boldRow;
    return [{ type: 'table', header, rows: cells }];
  }

  private image(el: Element): Block[] {
    const src = safeImageSrc(el.getAttribute('src'));
    const tiny = Number(el.getAttribute('width')) <= 2 && el.hasAttribute('width'); // tracking pixels
    if (!src || tiny) return [];
    return [{ type: 'image', src, alt: (el.getAttribute('alt') ?? '').trim() }];
  }

  /**
   * Flatten an element to inline content. Nested blocks become line breaks,
   * which is the right shape for list items, table cells and headings.
   */
  inline(el: Element, marks: Marks, applyOwnMarks = false, skipNestedLists = false): Inline[] {
    const own = applyOwnMarks ? marksFor(el, marks, this.report) : marks;
    const out: Inline[] = [];
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        out.push(...this.textNode(node, own));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const child = node as Element;
      const tag = child.localName;
      if (DROP.has(tag) || isHidden(child)) {
        if (CONTROLS.has(tag)) out.push({ type: 'text', text: ' ', marks: own });
        continue;
      }
      if (skipNestedLists && (tag === 'ul' || tag === 'ol' || (tag === 'div' && child.querySelector(':scope > ul, :scope > ol')))) continue;
      if (tag === 'br') {
        out.push({ type: 'break' });
        continue;
      }
      if (tag === 'img') continue;
      const isBlock = BLOCKS.has(tag);
      if (isBlock && out.some((n) => n.type === 'text' && n.text.trim())) out.push({ type: 'break' });
      out.push(...this.inline(child, isBlock ? marksFor(child, own, this.report) : own, !isBlock));
    }
    return out;
  }

  private textNode(node: Node, marks: Marks): Inline[] {
    const raw = node.textContent ?? '';
    // Collapsing HTML whitespace is normally just how the source rendered. Under
    // white-space:pre (Google Docs, some editors) the extra spaces were visible, so it's a real fix.
    if (/white-space\s*:\s*pre/.test(style(node.parentElement ?? document.body))) {
      this.report.add('whitespace', raw.match(/[ \t]{2,}/g)?.length ?? 0);
    }
    const value = cleanCharacters(raw.replace(/[ \t\n\r\f]+/g, ' '), this.report);
    return value ? [{ type: 'text', text: value, marks }] : [];
  }
}

function codeText(el: Element): string {
  const lines: string[] = [];
  let current = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const child = node as Element;
    if (child.localName === 'br') {
      lines.push(current);
      current = '';
      return;
    }
    const isLine = child !== el && (child.localName === 'div' || child.localName === 'p');
    if (isLine && current) {
      lines.push(current);
      current = '';
    }
    child.childNodes.forEach(walk);
    if (isLine) {
      lines.push(current);
      current = '';
    }
  };
  walk(el);
  if (current) lines.push(current);
  return lines.join('\n').replace(/\u00A0/g, ' ').replace(/\n+$/, '');
}

/**
 * Word lists copied without their mso-list:Ignore markers carry the bullet
 * as text ("·", "o", "§", "1."). Remove it from the item's first run.
 */
const LIST_MARKER = /^\s*(?:[·•▪◦§o\-–]|\(?[0-9a-z]{1,3}[.)])(?:\s|\u00a0)+/i;

function stripListMarker(content: Inline[]): string {
  let removed = '';
  while (content.length && content[0].type === 'text') {
    const first = content[0];
    const match = LIST_MARKER.exec(first.text) ?? (/^\s*[·•▪◦§o]\s*$/.test(first.text) ? [first.text] : null);
    if (!match) break;
    removed += match[0];
    first.text = first.text.slice(match[0].length);
    if (first.text) break;
    content.shift();
  }
  return removed;
}
