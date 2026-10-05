import { ADAPTERS } from './destinations/adapters';
import { DEFAULT_FORMAT, type DestinationAdapter, type DestinationId, type FormatSettings } from './destinations/types';
import { detectSource, type PastePayload, type SourceInfo } from './detect-source';
import { forEachInline, type Doc } from './model';
import { normalizeDoc } from './normalize';
import { parseHtml } from './parse-html';
import { parseText } from './parse-text';
import { renderText } from './render-text';
import { Report, type Note } from './report';
import { renderMatched, type RoleCounts } from './style/render-matched';
import type { StyleProfile } from './style/types';

/** Above this size we leave paste alone rather than risk a visible stall. */
export const MAX_INPUT_CHARS = 1_000_000;

export interface TransformOptions {
  destination: DestinationId;
  settings?: Partial<FormatSettings>;
  /** The target is a single-line input. */
  singleLine?: boolean;
  /** The destination document's learned look; applied to rich destinations. */
  style?: StyleProfile;
  /**
   * 'adapt' (default): take on the destination's formatting.
   * 'preserve': the destination is blank, so keep the source's look, repaired.
   * A learned `style` always wins: matching a designed document is the point.
   */
  mode?: 'adapt' | 'preserve';
}

export type TransformResult =
  | {
      ok: true;
      source: SourceInfo;
      destination: DestinationAdapter;
      doc: Doc;
      html?: string;
      text: string;
      notes: Note[];
      /** False when the output adds nothing over a normal paste — callers should not intercept. */
      changed: boolean;
      ms: number;
    }
  | { ok: false; reason: 'empty' | 'too-large' | 'unsupported' | 'error'; message?: string };

/**
 * The whole engine:
 * detect content → parse → normalize → pick strategy → render (sanitized by construction).
 *
 * Never throws. Any failure is reported as { ok: false } so callers can fall
 * back to the browser's own paste.
 */
export function transform(payload: PastePayload, options: TransformOptions): TransformResult {
  const started = performance.now();
  try {
    const source = detectSource(payload);
    if (source.kind === 'empty') return { ok: false, reason: 'empty' };
    if ((payload.html?.length ?? 0) + (payload.text?.length ?? 0) > MAX_INPUT_CHARS) return { ok: false, reason: 'too-large' };

    const report = new Report();
    const settings: FormatSettings = { ...DEFAULT_FORMAT, ...options.settings };
    const parsed = source.kind === 'html' ? parseHtml(payload.html!, report) : parseText(payload.text ?? '', report, { markdown: source.kind === 'markdown' });
    const doc = normalizeDoc(parsed, report);
    if (!doc.blocks.length) return { ok: false, reason: 'unsupported' };

    reportFormatting(doc, settings, report);
    const destination = ADAPTERS[options.destination] ?? ADAPTERS.rich;
    const matching = !!options.style && destination.mode === 'rich';
    const preserve = !matching && options.mode === 'preserve' && destination.mode === 'rich' && destination.id !== 'slack';
    if (preserve) {
      report.omit('styles');
      if (hasSourceFonts(doc)) report.add('kept-source');
    } else {
      // Repairs to the source look only matter when that look is kept.
      report.omit('invisible-text');
      report.omit('oversized');
    }
    const rendered = matching ? renderInStyle(doc, options.style!, settings, report) : destination.render(doc, { settings, source, report, preserve });

    let text = rendered.text;
    if (options.singleLine && /\n/.test(text.trim())) {
      text = text.replace(/\s*\n+\s*/g, ' ').trim();
      report.add('single-line');
    }

    const notes = report.notes(destination.mode);
    const changed =
      destination.mode === 'plain'
        ? text !== (payload.text ?? '').replace(/\r\n?/g, '\n')
        : notes.some((note) => note.id !== 'links');

    return { ok: true, source, destination, doc, html: rendered.html, text, notes, changed, ms: performance.now() - started };
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

function reportFormatting(doc: Doc, settings: FormatSettings, report: Report): void {
  let links = 0;
  let emphasis = false;
  let previousHref: string | undefined;
  forEachInline(doc.blocks, (node) => {
    const href = node.type === 'text' ? node.marks.href : undefined;
    if (href && href !== previousHref) links++;
    previousHref = href;
    if (node.type === 'text' && (node.marks.bold || node.marks.italic || node.marks.strike)) emphasis = true;
  });
  if (settings.preserveLinks) report.add('links', links);
  else report.add('links-removed', links ? 1 : 0);
  if (!settings.preserveEmphasis && emphasis) report.add('emphasis-removed');
}

function renderInStyle(doc: Doc, style: StyleProfile, settings: FormatSettings, report: Report) {
  const inline = { links: settings.preserveLinks, emphasis: settings.preserveEmphasis };
  const { html, counts } = renderMatched(doc, style, inline);
  report.add('matched-style', 1, describeCounts(counts));
  return { html, text: renderText(doc, { flavor: 'clean', ...inline }) };
}

function describeCounts(counts: RoleCounts): string {
  const label: Record<keyof RoleCounts, string> = { heading: 'heading', entry: 'entry', bullet: 'bullet', body: 'paragraph' };
  return (Object.keys(counts) as (keyof RoleCounts)[])
    .filter((role) => counts[role])
    .map((role) => `${counts[role]} ${counts[role] === 1 ? label[role] : role === 'entry' ? 'entries' : `${label[role]}s`}`)
    .join(', ');
}

function hasSourceFonts(doc: Doc): boolean {
  let found = false;
  forEachInline(doc.blocks, (node) => {
    if (node.type === 'text' && node.marks.font) found = true;
  });
  return found;
}
