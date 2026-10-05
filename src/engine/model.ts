/**
 * The normalized document model.
 *
 * Every input format (HTML, Markdown, plain text) is parsed into this small
 * structure, and every destination renders from it. Keeping it deliberately
 * tiny is what makes adding a new source or destination cheap.
 */

/** The source's own look for a run, kept when pasting into a blank document. Values are allowlisted CSS. */
export interface SourceFont {
  family?: string;
  size?: string;
  color?: string;
}

export interface Marks {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
  font?: SourceFont;
}

export type Inline = { type: 'text'; text: string; marks: Marks } | { type: 'break' };

export interface ListItem {
  content: Inline[];
  /** Nested lists (and, rarely, other blocks) belonging to this item. */
  children: Block[];
}

export type HeadingLevel = 1 | 2 | 3;

export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'heading'; level: HeadingLevel; content: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'quote'; children: Block[] }
  | { type: 'code'; text: string }
  | { type: 'table'; header: boolean; rows: Inline[][][] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'rule' };

export interface Doc {
  blocks: Block[];
}

export const text = (value: string, marks: Marks = {}): Inline => ({ type: 'text', text: value, marks });

export function sameMarks(a: Marks, b: Marks): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.strike === !!b.strike &&
    !!a.code === !!b.code &&
    (a.href ?? '') === (b.href ?? '') &&
    (a.font?.family ?? '') === (b.font?.family ?? '') &&
    (a.font?.size ?? '') === (b.font?.size ?? '') &&
    (a.font?.color ?? '') === (b.font?.color ?? '')
  );
}

/** Depth-first visit of every inline run in the document. */
export function forEachInline(blocks: Block[], visit: (node: Inline) => void): void {
  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        block.content.forEach(visit);
        break;
      case 'list':
        for (const item of block.items) {
          item.content.forEach(visit);
          forEachInline(item.children, visit);
        }
        break;
      case 'quote':
        forEachInline(block.children, visit);
        break;
      case 'table':
        block.rows.forEach((row) => row.forEach((cell) => cell.forEach(visit)));
        break;
    }
  }
}

export function docHas(doc: Doc, predicate: (block: Block) => boolean): boolean {
  const walk = (blocks: Block[]): boolean =>
    blocks.some(
      (block) =>
        predicate(block) ||
        (block.type === 'quote' && walk(block.children)) ||
        (block.type === 'list' && block.items.some((item) => walk(item.children))),
    );
  return walk(doc.blocks);
}

export function countBlocks(doc: Doc, type: Block['type']): number {
  let count = 0;
  docHas(doc, (block) => {
    if (block.type === type) count++;
    return false;
  });
  return count;
}
