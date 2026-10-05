/**
 * Collects what the engine actually changed, so the UI can explain itself
 * ("Normalized 3 bullets", "Preserved 2 links") instead of being a black box.
 */

export type NoteId =
  | 'unsafe'
  | 'styles'
  | 'office'
  | 'hidden-chars'
  | 'whitespace'
  | 'blank-lines'
  | 'reflow'
  | 'dehyphenate'
  | 'bullets'
  | 'numbering'
  | 'md-headings'
  | 'md-emphasis'
  | 'md-links'
  | 'md-lists'
  | 'table'
  | 'links'
  | 'kept-markdown'
  | 'headings-flattened'
  | 'table-as-text'
  | 'images-dropped'
  | 'email-spacing'
  | 'single-line'
  | 'emphasis-removed'
  | 'matched-style'
  | 'kept-source'
  | 'page-furniture'
  | 'invisible-text'
  | 'oversized'
  | 'links-removed';

/** Notes that only make sense when the destination renders rich text. */
const RICH_ONLY: ReadonlySet<NoteId> = new Set(['md-headings', 'md-emphasis', 'md-links', 'md-lists', 'table', 'matched-style', 'kept-source', 'invisible-text', 'oversized']);

const MESSAGES: Record<NoteId, (n: number, detail?: string) => string> = {
  unsafe: () => 'Removed scripts and unsafe markup',
  styles: () => 'Stripped source styling (fonts, sizes, colours)',
  office: () => 'Removed hidden Word/Office markup',
  'hidden-chars': (n) => `Removed ${n} invisible ${plural(n, 'character')}`,
  whitespace: (n) => `Collapsed ${n} ${plural(n, 'run')} of extra spaces`,
  'blank-lines': (n) => `Removed ${n} extra blank ${plural(n, 'line')}`,
  reflow: (n) => `Rejoined ${n} ${plural(n, 'paragraph')} broken by hard line wraps`,
  dehyphenate: (n) => `Fixed ${n} ${plural(n, 'word')} split across lines`,
  bullets: (n) => `Normalized ${n} ${plural(n, 'bullet')}`,
  numbering: () => 'Rebuilt numbered list',
  'md-headings': () => 'Converted Markdown headings',
  'md-emphasis': () => 'Converted Markdown emphasis',
  'md-links': (n) => `Converted ${n} Markdown ${plural(n, 'link')}`,
  'md-lists': () => 'Converted Markdown lists into real lists',
  table: () => 'Turned tab-separated rows into a table',
  links: (n) => `Preserved ${n} ${plural(n, 'link')}`,
  'kept-markdown': () => 'Kept Markdown as text for a plain-text field',
  'headings-flattened': (_n, dest) => `Headings pasted as bold text to match ${dest ?? 'the destination'}`,
  'table-as-text': () => 'Table converted to aligned text',
  'images-dropped': (n) => `Left out ${n} ${plural(n, 'image')} the destination can't accept`,
  'email-spacing': () => 'Applied email-friendly paragraph spacing',
  'single-line': () => 'Joined onto one line for a single-line field',
  'emphasis-removed': () => 'Removed bold and italic (per your settings)',
  'page-furniture': (n) => `Removed ${n} page ${plural(n, 'header')} (“Page 4 of 38”)`,
  'kept-source': () => 'Kept the original look (fonts, sizes, colours) for a blank document',
  'invisible-text': (n) => `Fixed ${n} ${plural(n, 'bit')} of light text that would vanish on a white page`,
  oversized: (n) => `Tamed ${n} oversized ${plural(n, 'letter')} (drop caps, giant text)`,
  'matched-style': (_n, detail) => `Matched your document’s style${detail ? ` (${detail})` : ''}`,
  'links-removed': () => 'Removed links (per your settings)',
};

/** Display order: most meaningful changes first. */
const ORDER: NoteId[] = [
  'matched-style', 'kept-source', 'invisible-text', 'oversized', 'unsafe', 'styles', 'office', 'page-furniture', 'reflow', 'dehyphenate', 'bullets', 'numbering', 'md-lists', 'md-headings',
  'md-emphasis', 'md-links', 'table', 'kept-markdown', 'headings-flattened', 'table-as-text', 'email-spacing',
  'single-line', 'whitespace', 'blank-lines', 'hidden-chars', 'links', 'images-dropped', 'emphasis-removed',
  'links-removed',
];

export interface Note {
  id: NoteId;
  count: number;
  message: string;
}

export class Report {
  private counts = new Map<NoteId, number>();
  private details = new Map<NoteId, string>();

  add(id: NoteId, count = 1, detail?: string): void {
    if (count <= 0) return;
    this.counts.set(id, (this.counts.get(id) ?? 0) + count);
    if (detail) this.details.set(id, detail);
  }

  /** Drop a note that no longer describes the output. */
  omit(id: NoteId): void {
    this.counts.delete(id);
  }

  /** Notes relevant to the destination's rendering mode, in display order. */
  notes(mode: 'rich' | 'plain'): Note[] {
    return ORDER.filter((id) => this.counts.has(id) && !(mode === 'plain' && RICH_ONLY.has(id))).map((id) => {
      const count = this.counts.get(id)!;
      return { id, count, message: MESSAGES[id](count, this.details.get(id)) };
    });
  }
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
