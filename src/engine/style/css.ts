import type { BlockStyle, TextStyle } from './types';

/**
 * Strict CSS value allowlist. Learned styles come from clipboard HTML, so
 * every value is validated before it is stored or rendered: only fonts,
 * sizes, colours and spacing survive, in plain forms.
 */

const LENGTH = /^-?\d{1,3}(\.\d{1,3})?(pt|px)$/;

export function cleanFontFamily(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const families = value
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, ''))
    .filter((part) => /^[A-Za-z0-9 -]{1,40}$/.test(part))
    .slice(0, 4);
  if (!families.length) return undefined;
  return families.map((name) => (/\s/.test(name) ? `'${name}'` : name)).join(', ');
}

export function cleanFontSize(value: string | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v || !LENGTH.test(v)) return undefined;
  const n = parseFloat(v);
  return n >= 5 && n <= 96 ? v : undefined;
}

export function cleanLength(value: string | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (v === '0') return '0pt';
  return LENGTH.test(v) ? v : undefined;
}

export function cleanLineHeight(value: string | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (/^\d(\.\d{1,3})?$/.test(v)) return v;
  return LENGTH.test(v) ? v : undefined;
}

export function cleanColor(value: string | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (rgb && (rgb[4] === undefined || parseFloat(rgb[4]) > 0)) {
    const hex = rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'));
    return `#${hex.join('')}`;
  }
  return undefined;
}

export function textCss(style: TextStyle): string {
  const parts: string[] = [];
  if (style.fontFamily) parts.push(`font-family:${style.fontFamily}`);
  if (style.fontSize) parts.push(`font-size:${style.fontSize}`);
  if (style.color) parts.push(`color:${style.color}`);
  parts.push(`font-weight:${style.bold ? 700 : 400}`);
  parts.push(`font-style:${style.italic ? 'italic' : 'normal'}`);
  return parts.join(';');
}

export function blockCss(style: BlockStyle): string {
  const parts: string[] = [];
  parts.push(`margin-top:${style.marginTop ?? '0pt'}`);
  parts.push(`margin-bottom:${style.marginBottom ?? '0pt'}`);
  if (style.lineHeight) parts.push(`line-height:${style.lineHeight}`);
  return parts.join(';');
}
