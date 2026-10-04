import type { Block, Doc, Inline } from './model';

export interface TextOptions {
  /** 'markdown' keeps Markdown syntax; 'clean' is human-readable plain text. */
  flavor: 'clean' | 'markdown';
  links: boolean;
  emphasis: boolean;
}

const CLEAN_BULLETS = ['•', '◦', '▪'];

export function renderText(doc: Doc, options: TextOptions): string {
  return doc.blocks
    .map((block) => renderBlock(block, options))
    .filter((chunk) => chunk !== '')
    .join('\n\n');
}

function renderBlock(block: Block, options: TextOptions): string {
  const md = options.flavor === 'markdown';
  switch (block.type) {
    case 'paragraph':
      return renderInlines(block.content, options);
    case 'heading':
      return (md ? `${'#'.repeat(block.level)} ` : '') + renderInlines(block.content, { ...options, emphasis: false });
    case 'list':
      return renderList(block, options, '', 0);
    case 'quote':
      return block.children
        .map((child) => renderBlock(child, options))
        .join('\n\n')
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'code':
      return md ? `\`\`\`\n${block.text}\n\`\`\`` : block.text;
    case 'table':
      if (!md) return block.rows.map((row) => row.map((cell) => renderInlines(cell, options)).join('\t')).join('\n');
      return pipeTable(block, options);
    case 'image':
      return md && block.src.startsWith('http') ? `![${block.alt}](${block.src})` : '';
    case 'rule':
      return md ? '---' : '';
  }
}

function renderList(block: Extract<Block, { type: 'list' }>, options: TextOptions, indent: string, depth: number): string {
  const lines: string[] = [];
  block.items.forEach((item, index) => {
    const marker = block.ordered
      ? `${block.start + index}.`
      : options.flavor === 'markdown'
        ? '-'
        : CLEAN_BULLETS[Math.min(depth, CLEAN_BULLETS.length - 1)];
    const childIndent = indent + ' '.repeat(marker.length + 1);
    const body = renderInlines(item.content, options).replace(/\n/g, `\n${childIndent}`);
    lines.push(`${indent}${marker} ${body}`);
    for (const child of item.children) {
      lines.push(
        child.type === 'list'
          ? renderList(child, options, childIndent, depth + 1)
          : childIndent + renderBlock(child, options).replace(/\n/g, `\n${childIndent}`),
      );
    }
  });
  return lines.join('\n');
}

function pipeTable(block: Extract<Block, { type: 'table' }>, options: TextOptions): string {
  const rows = block.rows.map((row) => row.map((cell) => renderInlines(cell, options).replace(/\|/g, '\\|').replace(/\n/g, ' ')));
  const width = Math.max(...rows.map((row) => row.length));
  const line = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`;
  return [line(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}

/** Monospace-aligned table for destinations without real tables (Slack). */
export function tableAsAlignedText(block: Extract<Block, { type: 'table' }>): string {
  const plain: TextOptions = { flavor: 'clean', links: false, emphasis: false };
  const rows = block.rows.map((row) => row.map((cell) => renderInlines(cell, plain).replace(/\n/g, ' ')));
  const widths = rows[0].map((_, col) => Math.max(...rows.map((row) => (row[col] ?? '').length)));
  const format = (row: string[]) => row.map((cell, col) => cell.padEnd(widths[col])).join('  ').trimEnd();
  const out = rows.map(format);
  if (block.header) out.splice(1, 0, widths.map((w) => '-'.repeat(w)).join('  '));
  return out.join('\n');
}

export function renderInlines(content: Inline[], options: TextOptions): string {
  let out = '';
  let i = 0;
  while (i < content.length) {
    const node = content[i];
    if (node.type === 'break') {
      out += '\n';
      i++;
      continue;
    }
    const href = options.links ? node.marks.href : undefined;
    let label = '';
    while (i < content.length) {
      const run = content[i];
      if (run.type !== 'text' || (options.links ? run.marks.href : undefined) !== href) break;
      label += renderRun(run.text, run.marks, options);
      i++;
    }
    out += href ? renderLink(label, href, options) : label;
  }
  return out;
}

function renderLink(label: string, href: string, options: TextOptions): string {
  const bare = href.replace(/^mailto:/, '').replace(/\/$/, '');
  const same = label === href || label.replace(/\/$/, '') === bare || `https://${label}` === href || `http://${label}` === href;
  if (same) return label;
  return options.flavor === 'markdown' ? `[${label}](${href})` : `${label} (${bare})`;
}

function renderRun(value: string, marks: Extract<Inline, { type: 'text' }>['marks'], options: TextOptions): string {
  if (options.flavor !== 'markdown') return value;
  if (marks.code) return `\`${value}\``;
  if (!options.emphasis) return value;
  // Markers must hug the text: "**word** " not "**word **".
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(value)!;
  if (!core) return value;
  let wrapped = core;
  if (marks.strike) wrapped = `~~${wrapped}~~`;
  if (marks.italic) wrapped = `*${wrapped}*`;
  if (marks.bold) wrapped = `**${wrapped}**`;
  return lead + wrapped + trail;
}
