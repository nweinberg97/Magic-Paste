import { buildLists, type FlatItem } from './lists';
import type { Block, Doc, HeadingLevel, Inline, Marks } from './model';
import type { Report } from './report';
import { safeImageSrc, safeUrl } from './sanitize';
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

function marksFor(el: Element, marks: Marks): Marks {
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
  return next;
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

    for (const node of Array.from(parent.childNodes)) {
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
        wordList.push({
          level: wordLevel,
          ordered: /^\(?[0-9a-z]{1,4}[.)]/i.test(marker.trim()),
          content: this.inline(el, marks),
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

  private block(el: Element, marks: Marks): Block[] {
    const tag = el.localName;

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
    if (tag === 'pre' || this.isCodeBlock(el)) return [{ type: 'code', text: codeText(el) }];
    if (tag === 'hr') return [{ type: 'rule' }];
    if (tag === 'img') return this.image(el);
    if (tag === 'table') return this.table(el, marks);
    return this.blocks(el, marksFor(el, marks));
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
      out.push({ level: itemLevel, ordered, start: start++, content: this.inline(child, marks, false, true) });
      for (const nested of Array.from(child.querySelectorAll(':scope > ul, :scope > ol, :scope > div > ul, :scope > div > ol'))) {
        this.listItems(nested, itemLevel + 1, marks, out);
      }
    }
  }

  private table(el: Element, marks: Marks): Block[] {
    const table = el as HTMLTableElement;
    const rows = Array.from(table.rows).filter((row) => row.closest('table') === table);
    const width = Math.max(0, ...rows.map((row) => row.cells.length));
    // Layout tables (one column, or tables of tables) are containers, not data.
    if (width < 2 || table.querySelector('table')) {
      return rows.flatMap((row) => Array.from(row.cells).flatMap((cell) => this.blocks(cell, marks)));
    }
    const cells = rows
      .map((row) => Array.from(row.cells).map((cell) => this.inline(cell, marks)))
      .filter((row) => row.some((cell) => cell.some((node) => node.type === 'text' && node.text.trim())));
    if (!cells.length) return [];
    const first = rows[0];
    const header = !!first && (first.parentElement?.localName === 'thead' || Array.from(first.cells).every((c) => c.localName === 'th'));
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
    const own = applyOwnMarks ? marksFor(el, marks) : marks;
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
      out.push(...this.inline(child, isBlock ? marksFor(child, own) : own, !isBlock));
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
