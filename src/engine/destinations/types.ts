import type { SourceInfo } from '../detect-source';
import type { Doc } from '../model';
import type { Report } from '../report';

export type DestinationId = 'google-docs' | 'gmail' | 'slack' | 'notion' | 'rich' | 'plain';

/** User-facing formatting preferences that the engine honours. */
export interface FormatSettings {
  preserveLinks: boolean;
  preserveEmphasis: boolean;
}

export const DEFAULT_FORMAT: FormatSettings = { preserveLinks: true, preserveEmphasis: true };

export interface RenderContext {
  settings: FormatSettings;
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
   * How the live extension delivers content here.
   * 'intercept' — handled on Cmd/Ctrl+V.
   * 'clipboard' — the page owns paste (e.g. Google Docs' canvas editor), so the
   * extension prepares the clipboard from the popup instead.
   */
  delivery: 'intercept' | 'clipboard';
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
}
