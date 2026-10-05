import { buildLists, type FlatItem } from './lists';
import type { Block, Doc, Inline } from './model';
import { parseInline } from './parse-inline';
import type { Report } from './report';
import { cleanCharacters, collapseSpaces, looksLikeMarkdown } from './text';

/**
 * Plain text / Markdown → document model.
 *
 * Plain text is treated conservatively: we rebuild structure that is
 * unambiguous (bullets, numbered lists, tab-separated tables, hard-wrapped
 * PDF paragraphs) and never invent headings. Markdown syntax is interpreted
 * only when the text clearly is Markdown.
 */
export function parseText(input: string, report: Report, options: { markdown?: boolean } = {}): Doc {
  const source = cleanCharacters(input, report);
  const markdown = options.markdown ?? looksLikeMarkdown(source);
  const lines = dropPageFurniture(source.split('\n').map((line) => line.replace(/[ \t]+$/, '')), report);
  return { blocks: new TextParser(lines, markdown, report).parse() };
}

// ---------------------------------------------------------------------------
// List markers

const DISC = '•●∙·◆➢➤►▸✓✔';
const CIRCLE = '○◦◇';
const SQUARE = '▪▫■□‣⁃';
const UNICODE_BULLET = new RegExp(`^([ \\t]*)([${DISC}${CIRCLE}${SQUARE}])[ \\t]*(\\S.*)$`);
const ASCII_BULLET = /^([ \t]*)([-*+])([ \t]+)(\S.*)$/;
const DASH_BULLET = /^([ \t]*)([–—])[ \t]+(\S.*)$/;
const NUMBERED = /^([ \t]*)(?:(\d{1,3})([.)])|\((\d{1,3})\))([ \t]+)(\S.*)$/;
const LETTERED = /^([ \t]*)([a-z])[.)][ \t]+(\S.*)$/;
const WORD_O = /^([ \t]*)o[ \t]+(\S.*)$/; // Word's second-level bullet, as copied into plain text

/** Classes that are, by convention, nested under another bullet when indentation is lost. */
const SUBORDINATE = new Set(['circle', 'alpha']);

interface Marker {
  indent: number;
  cls: string;
  ordered: boolean;
  number?: number;
  text: string;
  /** Unicode bullet or irregular spacing: something we actually cleaned. */
  messy: boolean;
  ascii: boolean;
}

function indentWidth(ws: string): number {
  return ws.replace(/\t/g, '    ').length;
}

function bulletClass(ch: string): string {
  if (CIRCLE.includes(ch)) return 'circle';
  if (SQUARE.includes(ch)) return 'square';
  return 'disc';
}

function matchMarker(line: string, inList: boolean, next: string | undefined): Marker | null {
  let m = UNICODE_BULLET.exec(line);
  if (m) return { indent: indentWidth(m[1]), cls: bulletClass(m[2]), ordered: false, text: m[3], messy: true, ascii: false };

  m = ASCII_BULLET.exec(line);
  if (m) {
    return { indent: indentWidth(m[1]), cls: 'disc', ordered: false, text: m[4], messy: m[3] !== ' ', ascii: true };
  }

  m = NUMBERED.exec(line);
  if (m) {
    const number = Number(m[2] ?? m[4]);
    const messy = m[5] !== ' ' || m[3] === ')' || m[4] !== undefined;
    return { indent: indentWidth(m[1]), cls: 'num', ordered: true, number, text: m[6], messy, ascii: !messy };
  }

  // Dashes only count as bullets in a run, so a lone "— attribution" stays prose.
  m = DASH_BULLET.exec(line);
  if (m && (inList || (next !== undefined && DASH_BULLET.test(next)))) {
    return { indent: indentWidth(m[1]), cls: 'disc', ordered: false, text: m[3], messy: true, ascii: false };
  }

  if (inList) {
    m = LETTERED.exec(line);
    if (m) return { indent: indentWidth(m[1]), cls: 'alpha', ordered: true, text: m[3], messy: true, ascii: false };
    m = WORD_O.exec(line);
    if (m) return { indent: indentWidth(m[1]), cls: 'circle', ordered: false, text: m[2], messy: true, ascii: false };
  }
  return null;
}

/**
 * Resolves nesting from indentation when it exists, and from the bullet
 * character when it doesn't (PDF and Word copies often lose indentation but
 * keep • / ◦ / ▪).
 */
class LevelTracker {
  private stack: { indent: number; cls: string }[] = [];

  level(marker: Marker): number {
    const s = this.stack;
    while (s.length && marker.indent < s.at(-1)!.indent - 1) s.pop();
    if (!s.length) {
      s.push(marker);
      return 0;
    }
    const top = s.at(-1)!;
    if (marker.indent > top.indent + 1) {
      s.push(marker);
      return s.length - 1;
    }
    for (let k = s.length - 1; k >= 0 && Math.abs(s[k].indent - marker.indent) <= 1; k--) {
      if (s[k].cls === marker.cls) {
        s.length = k + 1;
        return k;
      }
    }
    const nests =
      SUBORDINATE.has(marker.cls) ||
      (marker.cls === 'square' && top.cls === 'circle') || // • → ◦ → ▪, Word's default ladder
      (top.cls === 'num' && marker.cls === 'disc'); // bullets under numbered steps
    if (nests) {
      s.push(marker);
      return s.length - 1;
    }
    s[s.length - 1] = marker;
    return s.length - 1;
  }
}

// ---------------------------------------------------------------------------
// Tables

/** Tabs between values (not just leading indentation). */
const TAB_ROW = /\S\t+\S/;
const PIPE_SEPARATOR = /^\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?$/;

function tabCells(line: string): string[] {
  return line.replace(/^ +|\s+$/g, '').split('\t').map((cell) => cell.trim());
}

function pipeCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

const NUMERIC = /^[-+$€£¥]?\d[\d,.]*%?$|^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/;

// ---------------------------------------------------------------------------

const TERMINAL = /[.!?:;"”’)\]]$/;

interface PendingItem {
  level: number;
  ordered: boolean;
  start?: number;
  raw: string;
}

class TextParser {
  private i = 0;

  constructor(
    private readonly lines: string[],
    private readonly markdown: boolean,
    private readonly report: Report,
  ) {}

  parse(): Block[] {
    const blocks: Block[] = [];
    let blankRun = 0;
    let seenContent = false;

    while (this.i < this.lines.length) {
      const line = this.lines[this.i];
      if (!line.trim()) {
        blankRun++;
        this.i++;
        continue;
      }
      // One blank line between blocks is a separator; anything more is noise.
      this.report.add('blank-lines', seenContent ? blankRun - 1 : blankRun);
      blankRun = 0;
      seenContent = true;
      blocks.push(...this.block());
    }
    this.report.add('blank-lines', blankRun);
    return blocks;
  }

  private block(): Block[] {
    const line = this.lines[this.i];
    const next = this.lines[this.i + 1];

    if (this.markdown) {
      const fence = /^[ \t]*(```|~~~)/.exec(line);
      if (fence) return [this.codeBlock(fence[1])];

      const heading = /^[ \t]{0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(line);
      if (heading) {
        this.i++;
        this.report.add('md-headings');
        const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
        return [{ type: 'heading', level, content: this.inline(heading[2]) }];
      }

      if (/^[ \t]{0,3}([-*_])([ \t]*\1){2,}[ \t]*$/.test(line)) {
        this.i++;
        return [{ type: 'rule' }];
      }

      if (/^[ \t]{0,3}>/.test(line)) return [this.quote()];

      if (line.includes('|') && next !== undefined && PIPE_SEPARATOR.test(next.trim())) return [this.pipeTable()];
    }

    if (TAB_ROW.test(line) && next !== undefined && TAB_ROW.test(next)) {
      const table = this.tabTable();
      if (table) return [table];
    }

    if (matchMarker(line, false, next)) return this.list();

    return this.paragraphs();
  }

  /** True when a line begins a different block, ending a paragraph without a blank line. */
  private startsBlock(index: number): boolean {
    const line = this.lines[index];
    if (matchMarker(line, false, this.lines[index + 1])) return true;
    if (!this.markdown) return false;
    return /^[ \t]{0,3}(#{1,6}[ \t]|```|~~~|>)/.test(line);
  }

  private inline(raw: string): Inline[] {
    return parseInline(collapseSpaces(raw.trim(), this.report), { markdown: this.markdown, report: this.report });
  }

  private codeBlock(fence: string): Block {
    const body: string[] = [];
    this.i++;
    while (this.i < this.lines.length && !this.lines[this.i].trim().startsWith(fence)) body.push(this.lines[this.i++]);
    this.i++; // closing fence (or end of input)
    return { type: 'code', text: body.join('\n') };
  }

  private quote(): Block {
    const body: string[] = [];
    while (this.i < this.lines.length && /^[ \t]{0,3}>/.test(this.lines[this.i])) {
      body.push(this.lines[this.i++].replace(/^[ \t]{0,3}>[ \t]?/, ''));
    }
    return { type: 'quote', children: new TextParser(body, this.markdown, this.report).parse() };
  }

  private pipeTable(): Block {
    const rows: Inline[][][] = [pipeCells(this.lines[this.i]).map((cell) => this.inline(cell))];
    this.i += 2; // header + separator
    while (this.i < this.lines.length && this.lines[this.i].includes('|') && this.lines[this.i].trim()) {
      rows.push(pipeCells(this.lines[this.i++]).map((cell) => this.inline(cell)));
    }
    return { type: 'table', header: true, rows };
  }

  /** Spreadsheet copies arrive as tab-separated rows with a consistent column count. */
  private tabTable(): Block | null {
    const start = this.i;
    const width = tabCells(this.lines[start]).length;
    let end = start;
    while (end < this.lines.length && TAB_ROW.test(this.lines[end]) && tabCells(this.lines[end]).length <= width) end++;
    if (width < 2 || end - start < 2) return null;

    // Spreadsheets drop trailing empty cells, so short rows are padded back out.
    const cells = this.lines.slice(start, end).map((line) => [...tabCells(line), ...Array(width).fill('')].slice(0, width));
    this.i = end;
    this.report.add('table');
    const first = cells[0];
    const header = first.every((cell) => cell && cell.length < 40 && !NUMERIC.test(cell));
    return { type: 'table', header, rows: cells.map((row) => row.map((cell) => this.inline(cell))) };
  }

  private list(): Block[] {
    const pending: PendingItem[] = [];
    const levels = new LevelTracker();
    let expected = 0;
    let renumbered = false;

    while (this.i < this.lines.length) {
      const line = this.lines[this.i];
      const marker = matchMarker(line, true, this.lines[this.i + 1]);

      if (marker) {
        const level = levels.level(marker);
        if (marker.messy) this.report.add('bullets');
        if (marker.ascii && this.markdown) this.report.add('md-lists');
        if (marker.cls === 'num' && level === 0) {
          // Plain-text numbering becomes a real list; Markdown numbering is only "rebuilt" if it was off.
          if (!this.markdown || (expected && marker.number !== expected)) renumbered = true;
          expected = (marker.number ?? 0) + 1;
        }
        pending.push({ level, ordered: marker.ordered, start: marker.number, raw: marker.text });
        this.i++;
        continue;
      }

      if (!line.trim()) {
        // A blank line inside a list only continues it if another item follows.
        let j = this.i;
        while (j < this.lines.length && !this.lines[j].trim()) j++;
        if (j < this.lines.length && matchMarker(this.lines[j], true, this.lines[j + 1])) {
          this.report.add('blank-lines', j - this.i);
          this.i = j;
          continue;
        }
        break;
      }

      // Continuation of a wrapped item: indented, or a lowercase run-on of an unfinished sentence.
      const last = pending.at(-1);
      if (last && (/^[ \t]+\S/.test(line) || (!TERMINAL.test(last.raw) && /^[a-z]/.test(line.trim())))) {
        last.raw = joinWrapped(last.raw, line.trim(), this.report);
        this.i++;
        continue;
      }
      break;
    }

    if (renumbered) this.report.add('numbering');
    return buildLists(pending.map(({ raw, ...item }): FlatItem => ({ ...item, content: this.inline(raw) })));
  }

  private paragraphs(): Block[] {
    const chunk: string[] = [];
    while (this.i < this.lines.length && this.lines[this.i].trim()) {
      if (chunk.length && this.startsBlock(this.i)) break;
      chunk.push(this.lines[this.i++].trim());
    }

    if (!isHardWrapped(chunk)) {
      const content: Inline[] = [];
      chunk.forEach((line, n) => {
        if (n) content.push({ type: 'break' });
        content.push(...this.inline(line));
      });
      return [{ type: 'paragraph', content }];
    }

    // Reflow hard-wrapped text (PDFs, emails, terminals) into real paragraphs.
    const max = Math.max(...chunk.map((line) => line.length));
    const paragraphs: string[] = [];
    let current = '';
    let joined = 0;
    chunk.forEach((line, n) => {
      const nextLine = chunk[n + 1];
      if (!current) current = line;
      else {
        current = joinWrapped(current, line, this.report);
        joined++;
      }
      // In wrapped text only a paragraph's last line (or a title) is noticeably short.
      const short = (value: string) => value.length < max * 0.7;
      const endsParagraph =
        nextLine !== undefined &&
        ((short(line) && !/[,-]$/.test(line)) ||
          // A finished sentence followed by a short capitalised line: that line is a title or new paragraph.
          (TERMINAL.test(line) && short(nextLine) && /^[A-Z0-9]/.test(nextLine)));
      if (endsParagraph || nextLine === undefined) {
        paragraphs.push(current);
        if (joined) this.report.add('reflow');
        current = '';
        joined = 0;
      }
    });
    return paragraphs.map((p) => ({ type: 'paragraph', content: this.inline(p) }));
  }
}

export function isHardWrapped(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const max = Math.max(...lines.map((line) => line.length));
  if (max < 40) return false;
  const body = lines.slice(0, -1);
  const long = body.filter((line) => line.length >= max * 0.6).length;
  const unfinished = body.filter((line) => !TERMINAL.test(line)).length;
  return long / body.length >= 0.6 && unfinished > 0;
}

function joinWrapped(left: string, right: string, report: Report): string {
  // "produc-" + "tivity" → "productivity", but keep real hyphens like "follow-up".
  if (/[a-z]{2}-$/.test(left) && /^[a-z]/.test(right)) {
    report.add('dehyphenate');
    return left.slice(0, -1) + right;
  }
  return `${left} ${right}`;
}

/**
 * PDF running headers and footers ("Annual Report 2025      Page 4 of 38",
 * "Page 12") land in the middle of copied text. Only unmistakable page
 * markers are removed; a bare number on its own line could be content.
 */
const PAGE_MARKER = /^\s*(?:.{0,80}?\s{2,})?page\s+\d{1,4}(?:\s+(?:of|\/)\s+\d{1,4})?\s*$/i;

function dropPageFurniture(lines: string[], report: Report): string[] {
  const kept = lines.filter((line) => !PAGE_MARKER.test(line));
  report.add('page-furniture', lines.length - kept.length);
  return kept;
}
