import type { SourceInfo } from '../detect-source';
import type { Doc } from '../model';
import type { Report } from '../report';

export type DestinationId = 'google-docs' | 'gmail' | 'slack' | 'notion' | 'rich' | 'plain';

/** User-facing formatting preferences that the engine honours. */
export interface FormatSettings {
  preserveLinks: boolean;
  preserveEmphasis: boolean;
  /**
   * Google Docs: paste headings as Docs' Heading 1–3 styles. Off by default:
   * most pastes land in a document that already has a design (a resume, a
   * report template), where headings should be bold text in its own style.
   */
  docsHeadingStyles: boolean;
}

export const DEFAULT_FORMAT: FormatSettings = { preserveLinks: true, preserveEmphasis: true, docsHeadingStyles: false };

export interface RenderContext {
  settings: FormatSettings;
  /** Keep the source's look (the destination is blank) rather than adopting the destination's. */
  preserve: boolean;
  source: SourceInfo;
  report: Report;
}

export interface Rendered {
  /** Present for rich destinations. */
  html?: string;
  /** Always present: the text/plain flavour and the fallback. */
  text: string;
}

export interface DestinationAdapter {
  id: DestinationId;
  label: string;
  mode: 'rich' | 'plain';
  /**
   * How the live extension delivers content here on Cmd/Ctrl+V.
   * 'intercept' — the editor's own paste handler first, direct insertion as a fallback.
   * 'editor-only' — only through the editor's own paste handler. For editors
   * that draw their own surface (Google Docs' canvas), where inserting HTML
   * into the page would be invisible or harmful: if the editor doesn't accept
   * the cleaned paste, the browser's normal paste happens instead.
   */
  delivery: 'intercept' | 'editor-only';
  render(doc: Doc, context: RenderContext): Rendered;
}

/** Facts about the element receiving the paste, gathered by the content script. */
export interface PasteTarget {
  hostname: string;
  kind: 'input' | 'textarea' | 'plaintext-editable' | 'rich';
  singleLine: boolean;
  /** Code editors (Monaco, CodeMirror, Ace) must never be touched. */
  codeEditor: boolean;
  /** Explicit destination from a data-magic-paste-destination attribute. */
  override?: string;
  /**
   * Whether the destination is still blank: true/false when the editor's
   * content is visible to the page, undefined when it isn't (Google Docs
   * draws its pages on a canvas).
   */
  empty?: boolean;
}
