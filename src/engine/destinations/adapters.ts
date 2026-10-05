import { countBlocks, docHas, type Doc } from '../model';
import { renderHtml, type HtmlProfile } from '../render-html';
import { renderText } from '../render-text';
import type { DestinationAdapter, DestinationId, RenderContext, Rendered } from './types';

const SEMANTIC: HtmlProfile = { paragraphs: 'p', headings: 'semantic', tables: 'table', images: true, rules: true };

function inlineOptions(context: RenderContext) {
  return { links: context.settings.preserveLinks, emphasis: context.settings.preserveEmphasis, preserve: context.preserve };
}

/** The text/plain twin that accompanies every rich render. */
function cleanText(doc: Doc, context: RenderContext): string {
  return renderText(doc, { flavor: 'clean', ...inlineOptions(context) });
}

function richAdapter(id: DestinationId, label: string, profile: HtmlProfile): DestinationAdapter {
  return {
    id,
    label,
    mode: 'rich',
    delivery: 'intercept',
    render(doc, context): Rendered {
      return { html: renderHtml(doc, profile, inlineOptions(context)), text: cleanText(doc, context) };
    },
  };
}

/** Any contenteditable editor: semantic HTML, zero styling. */
export const genericRich = richAdapter('rich', 'Rich text', SEMANTIC);

/** Notion parses semantic HTML well; keep everything it can represent. */
export const notion = richAdapter('notion', 'Notion', SEMANTIC);

/**
 * Google Docs draws its editor on a canvas and runs its own paste pipeline, so
 * the cleaned content is handed to that pipeline (never inserted into the page).
 * Headings default to bold text so pasted content adopts the document's design.
 */
export const googleDocs: DestinationAdapter = {
  id: 'google-docs',
  label: 'Google Docs',
  mode: 'rich',
  delivery: 'editor-only',
  render(doc, context) {
    // A blank document keeps the source's headings; a designed one gets bold text in its own style.
    const headings = context.preserve || context.settings.docsHeadingStyles ? 'semantic' : 'bold';
    if (headings === 'bold' && docHas(doc, (b) => b.type === 'heading')) {
      context.report.add('headings-flattened', 1, 'your document’s styles');
    }
    return { html: renderHtml(doc, { ...SEMANTIC, headings }, inlineOptions(context)), text: cleanText(doc, context) };
  },
};

export const gmail: DestinationAdapter = {
  id: 'gmail',
  label: 'Gmail',
  mode: 'rich',
  delivery: 'intercept',
  render(doc, context) {
    const profile: HtmlProfile = { paragraphs: 'email', headings: 'bold', tables: 'email', images: true, rules: true };
    if (doc.blocks.length > 1) context.report.add('email-spacing');
    if (docHas(doc, (b) => b.type === 'heading')) context.report.add('headings-flattened', 1, 'Gmail');
    return { html: renderHtml(doc, profile, inlineOptions(context)), text: cleanText(doc, context) };
  },
};

export const slack: DestinationAdapter = {
  id: 'slack',
  label: 'Slack',
  mode: 'rich',
  delivery: 'intercept',
  render(doc, context) {
    // Slack's composer supports bold, italic, strike, code, links, lists and quotes. No headings, tables, rules or inline images.
    const profile: HtmlProfile = { paragraphs: 'p', headings: 'bold', tables: 'pre', images: false, rules: false };
    if (docHas(doc, (b) => b.type === 'heading')) context.report.add('headings-flattened', 1, 'Slack');
    if (docHas(doc, (b) => b.type === 'table')) context.report.add('table-as-text');
    context.report.add('images-dropped', countBlocks(doc, 'image'));
    // Slack has no fonts or colours, so there is no source look to keep.
    return { html: renderHtml(doc, profile, { ...inlineOptions(context), preserve: false }), text: cleanText(doc, context) };
  },
};

/**
 * Inputs, textareas and plain-text editors. Markdown stays Markdown (it is
 * the plain-text format for rich content); everything else becomes tidy text.
 */
export const plainText: DestinationAdapter = {
  id: 'plain',
  label: 'Plain text',
  mode: 'plain',
  delivery: 'intercept',
  render(doc, context) {
    const markdown = context.source.kind === 'markdown';
    if (markdown) context.report.add('kept-markdown');
    return { text: renderText(doc, { flavor: markdown ? 'markdown' : 'clean', ...inlineOptions(context) }) };
  },
};

export const ADAPTERS: Record<DestinationId, DestinationAdapter> = {
  'google-docs': googleDocs,
  gmail,
  slack,
  notion,
  rich: genericRich,
  plain: plainText,
};
