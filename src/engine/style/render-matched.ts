import type { Block, Doc, Inline } from '../model';
import { renderInlines, type InlineOptions } from '../render-html';
import { escapeHtml } from '../sanitize';
import { blockCss, textCss } from './css';
import type { BlockStyle, StyleProfile, StyleRole, TextStyle } from './types';

export type RoleCounts = Record<StyleRole, number>;

/**
 * Render the document in a learned style. Each block is given a role
 * (section heading, entry line, bullet, body) and drawn with that role's
 * fonts, colours and spacing from the destination document.
 */
export function renderMatched(doc: Doc, profile: StyleProfile, options: InlineOptions): { html: string; counts: RoleCounts } {
  const counts: RoleCounts = { heading: 0, entry: 0, bullet: 0, body: 0 };
  const body: TextStyle = profile.body?.text ?? profile.bullet?.text ?? profile.entry?.text ?? {};
  const bodyBlock: BlockStyle = profile.body?.block ?? {};

  const paragraph = (block: BlockStyle, style: TextStyle, inner: string, extraCss = '') =>
    `<p style="${escapeHtml(blockCss(block) + extraCss)}"><span style="${escapeHtml(textCss(style))}">${inner}</span></p>`;

  const heading = (content: Inline[]) => {
    counts.heading++;
    const role = profile.heading;
    let label = content.map((node) => (node.type === 'text' ? node.text : ' ')).join('').trim();
    if (role?.caps) label = label.toUpperCase();
    const rule = role?.ruleBefore ? `<hr style="border:none;border-top:1px solid ${escapeHtml(role.ruleColor ?? '#999999')}">` : '';
    return rule + paragraph(role?.block ?? bodyBlock, role?.text ?? { ...body, bold: true }, escapeHtml(label));
  };

  const entry = (content: Inline[]) => {
    counts.entry++;
    const role = profile.entry!;
    const split = role.datesRight ? splitTrailingDate(content) : null;
    if (!split) return paragraph(role.block, role.text, renderInlines(content, options));
    // HTML can't carry tab stops, so a borderless two-column row puts the dates flush right.
    const cell = 'padding:0;border:none;vertical-align:top';
    return (
      `<table style="border:none;border-collapse:collapse;width:100%;margin:0"><colgroup><col width="468"><col width="156"></colgroup><tbody><tr>` +
      `<td style="${cell}">${paragraph(role.block, role.text, renderInlines(split.main, options))}</td>` +
      `<td style="${cell};text-align:right;white-space:nowrap">${paragraph(role.block, { ...role.text, italic: role.dateItalic }, escapeHtml(split.date), ';text-align:right')}</td>` +
      `</tr></tbody></table>`
    );
  };

  const list = (block: Extract<Block, { type: 'list' }>): string => {
    const role = profile.bullet ?? { text: body, block: bodyBlock };
    const tag = block.ordered ? 'ol' : 'ul';
    const items = block.items.map((item) => {
      counts.bullet++;
      const nested = item.children.map(render).join('');
      return `<li style="${escapeHtml(textCss(role.text))}">${paragraph(role.block, role.text, renderInlines(item.content, options))}${nested}</li>`;
    });
    return `<${tag} style="margin-top:0;margin-bottom:0">${items.join('')}</${tag}>`;
  };

  const render = (block: Block): string => {
    switch (block.type) {
      case 'heading':
        return heading(block.content);
      case 'paragraph':
        if (isSectionHeading(block.content)) return heading(block.content);
        if (profile.entry && isEntry(block.content)) return entry(block.content);
        counts.body++;
        return paragraph(bodyBlock, body, renderInlines(block.content, options));
      case 'list':
        return list(block);
      case 'quote':
        return `<blockquote>${block.children.map(render).join('')}</blockquote>`;
      case 'code':
        return `<pre>${escapeHtml(block.text)}</pre>`;
      case 'table':
        return `<table>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${paragraph(bodyBlock, body, renderInlines(cell, options))}</td>`).join('')}</tr>`).join('')}</table>`;
      case 'image':
        return `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}">`;
      case 'rule':
        return '<hr>';
    }
  };

  return { html: doc.blocks.map(render).join(''), counts };
}

function visibleRuns(content: Inline[]) {
  return content.filter((node): node is Extract<Inline, { type: 'text' }> => node.type === 'text' && !!node.text.trim());
}

/** "**What shipped**" or "**Experience**": a short, fully bold line acting as a heading. */
function isSectionHeading(content: Inline[]): boolean {
  const runs = visibleRuns(content);
  const text = runs.map((r) => r.text).join('').trim();
  return (
    runs.length > 0 &&
    runs.every((r) => r.marks.bold && !r.marks.href) &&
    text.split(/\s+/).length <= 6 &&
    text.length <= 60 &&
    !/[.:;,]$/.test(text) &&
    !content.some((node) => node.type === 'break')
  );
}

/** "**Harbor & Pine**, Operations Coordinator … 2023": a bold lead-in followed by details. */
function isEntry(content: Inline[]): boolean {
  const runs = visibleRuns(content);
  const length = runs.reduce((n, r) => n + r.text.length, 0);
  return runs.length > 1 && !!runs[0].marks.bold && runs.some((r) => !r.marks.bold) && length <= 220 && !content.some((n) => n.type === 'break');
}

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+';
const POINT = `(?:${MONTH})?(?:19|20)\\d{2}`;
const DATE_TAIL = new RegExp(`\\s*(?:[·|•,–—-]|\\s{2,}|\\t)\\s*(${POINT}\\s*(?:[-–—]|to)\\s*(?:${POINT}|present|current|now)|${POINT})\\s*$`, 'i');

export function splitTrailingDate(content: Inline[]): { main: Inline[]; date: string } | null {
  const lastIndex = content.length - 1;
  const last = content[lastIndex];
  if (!last || last.type !== 'text') return null;
  const match = DATE_TAIL.exec(last.text);
  if (!match) return null;
  const main = [...content.slice(0, lastIndex), { ...last, text: last.text.slice(0, match.index) }];
  return { main: main.filter((node) => node.type !== 'text' || node.text), date: match[1].trim() };
}
