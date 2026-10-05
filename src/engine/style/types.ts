/**
 * A destination document's look, learned from a sample the user copied out
 * of it. Values are validated CSS fragments (see css.ts) so a profile can be
 * stored, synced and rendered without ever carrying arbitrary markup.
 */

export interface TextStyle {
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface BlockStyle {
  marginTop?: string;
  marginBottom?: string;
  lineHeight?: string;
}

export interface RoleStyle {
  text: TextStyle;
  block: BlockStyle;
}

export interface StyleProfile {
  version: 1;
  /** Section headings ("PROFILE", "EXPERIENCE"). */
  heading?: RoleStyle & { caps: boolean; ruleBefore: boolean; ruleColor?: string };
  /** Entry lines ("Company, Title (location) … dates"). */
  entry?: RoleStyle & { datesRight: boolean; dateItalic: boolean };
  bullet?: RoleStyle;
  body?: RoleStyle;
}

export type StyleRole = 'heading' | 'entry' | 'bullet' | 'body';
