import type { Block, Doc, Inline, ListItem } from './model';
import { escapeHtml } from './sanitize';
import { tableAsAlignedText } from './render-text';

/** How a destination wants structure expressed in HTML. */
export interface HtmlProfile {
  /** 'email' mirrors Gmail's own model: <div> lines with <div><br></div> spacers. */
  paragraphs: 'p' | 'email';
  headings: 'semantic' | 'bold';
  tables: 'table' | 'email' | 'pre';
  images: boolean;
  rules: boolean;
}

export interface InlineOptions {
  links: boolean;
  emphasis: boolean;
}

/**
 * Render the document as HTML using a fixed allowlist of tags. Every text
 * value is escaped and every URL was validated at parse time, so the output
 * cannot carry source styles, attributes or script.
 */
export function renderHtml(doc: Doc, profile: HtmlProfile, options: InlineOptions): string {
  const blocks = doc.blocks.map((block) => renderBlock(block, profile, options)).filter(Boolean);
  if (profile.paragraphs === 'email') return blocks.join('<div><br></div>');
  return blocks.join('');
}

function renderBlock(block: Block, profile: HtmlProfile, options: InlineOptions): string {
  const line = (inner: string) => (profile.paragraphs === 'email' ? `<div>${inner}</div>` : `<p>${inner}</p>`);
  switch (block.type) {
    case 'paragraph':
      return line(renderInlines(block.content, options));
    case 'heading':
      return profile.headings === 'semantic'
        ? `<h${block.level}>${renderInlines(block.content, options)}</h${block.level}>`
        : line(`<strong>${renderInlines(block.content, { ...options, emphasis: false })}</strong>`);
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : '';
      return `<${tag}${start}>${block.items.map((item) => renderItem(item, profile, options)).join('')}</${tag}>`;
    }
    case 'quote':
      return `<blockquote>${block.children.map((child) => renderBlock(child, { ...profile, paragraphs: 'p' }, options)).join('')}</blockquote>`;
    case 'code':
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case 'table':
      return renderTable(block, profile, options);
    case 'image':
      return profile.images ? `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}">` : '';
    case 'rule':
      return profile.rules ? '<hr>' : '';
  }
}

function renderItem(item: ListItem, profile: HtmlProfile, options: InlineOptions): string {
  const children = item.children.map((child) => renderBlock(child, profile, options)).join('');
  return `<li>${renderInlines(item.content, options)}${children}</li>`;
}

function renderTable(block: Extract<Block, { type: 'table' }>, profile: HtmlProfile, options: InlineOptions): string {
  if (profile.tables === 'pre') return `<pre>${escapeHtml(tableAsAlignedText(block))}</pre>`;
  const cell = (tag: string, content: Inline[]) => `<${tag}>${renderInlines(content, options)}</${tag}>`;
  const [first, ...rest] = block.rows;
  const head = block.header ? `<thead><tr>${first.map((c) => cell('th', c)).join('')}</tr></thead>` : '';
  const bodyRows = block.header ? rest : block.rows;
  const body = `<tbody>${bodyRows.map((row) => `<tr>${row.map((c) => cell('td', c)).join('')}</tr>`).join('')}</tbody>`;
  // Email clients drop stylesheet defaults, so tables need a visible grid to stay readable.
  const attrs = profile.tables === 'email' ? ' border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse"' : '';
  return `<table${attrs}>${head}${body}</table>`;
}

export function renderInlines(content: Inline[], options: InlineOptions): string {
  let html = '';
  let i = 0;
  while (i < content.length) {
    const node = content[i];
    if (node.type === 'break') {
      html += '<br>';
      i++;
      continue;
    }
    // Group consecutive runs that share a link so "a **bold** link" stays one <a>.
    const href = options.links ? node.marks.href : undefined;
    let inner = '';
    while (i < content.length) {
      const run = content[i];
      if (run.type !== 'text' || (options.links ? run.marks.href : undefined) !== href) break;
      inner += renderRun(run, options);
      i++;
    }
    html += href ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
  }
  return html;
}

function renderRun(node: Extract<Inline, { type: 'text' }>, options: InlineOptions): string {
  let out = escapeHtml(node.text);
  if (node.marks.code) out = `<code>${out}</code>`;
  if (!options.emphasis) return out;
  if (node.marks.strike) out = `<s>${out}</s>`;
  if (node.marks.italic) out = `<em>${out}</em>`;
  if (node.marks.bold) out = `<strong>${out}</strong>`;
  return out;
}
