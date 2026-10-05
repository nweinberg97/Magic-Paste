import { sameMarks, type Block, type Doc, type Inline } from './model';
import type { Report } from './report';
import { collapseSpaces } from './text';

/**
 * Cleanup that applies regardless of source: tidy inline runs, drop empty
 * blocks, split <br><br> pseudo-paragraphs, and merge lists that sources
 * (notably Google Docs) split into fragments.
 */
export function normalizeDoc(doc: Doc, report: Report): Doc {
  return { blocks: normalizeBlocks(doc.blocks, report) };
}

function normalizeBlocks(blocks: Block[], report: Report): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph': {
        for (const content of splitOnBlankLines(block.content, report)) {
          const clean = normalizeInlines(content, report);
          if (clean.length) out.push({ type: 'paragraph', content: clean });
        }
        break;
      }
      case 'heading': {
        const content = normalizeInlines(block.content, report).filter((node) => node.type === 'text');
        if (content.length) out.push({ ...block, content });
        break;
      }
      case 'list': {
        const items = block.items
          .map((item) => ({ content: normalizeInlines(item.content, report), children: normalizeBlocks(item.children, report) }))
          .filter((item) => item.content.length || item.children.length);
        if (!items.length) break;
        const previous = out.at(-1);
        if (previous?.type === 'list' && previous.ordered === block.ordered) previous.items.push(...items);
        else out.push({ ...block, items });
        break;
      }
      case 'quote': {
        const children = normalizeBlocks(block.children, report);
        if (children.length) out.push({ type: 'quote', children });
        break;
      }
      case 'code':
        if (block.text.trim()) out.push(block);
        break;
      case 'table': {
        const rows = block.rows
          .map((row) => row.map((cell) => normalizeInlines(cell, report)))
          .filter((row) => row.some((cell) => cell.length));
        if (rows.length) out.push({ ...block, rows });
        break;
      }
      case 'rule':
        if (out.length && out.at(-1)!.type !== 'rule') out.push(block);
        break;
      case 'image':
        out.push(block);
        break;
    }
  }
  if (out.at(-1)?.type === 'rule') out.pop();
  return out;
}

/** "Line one<br><br>Line two" is two paragraphs pretending to be one. */
function splitOnBlankLines(content: Inline[], report: Report): Inline[][] {
  const parts: Inline[][] = [[]];
  let breaks = 0;
  for (const node of content) {
    if (node.type === 'break') {
      breaks++;
      continue;
    }
    if (!node.text.trim() && breaks) continue;
    if (breaks >= 2 && parts.at(-1)!.length) {
      report.add('blank-lines', breaks - 2);
      parts.push([]);
    } else if (breaks === 1) {
      parts.at(-1)!.push({ type: 'break' });
    }
    breaks = 0;
    parts.at(-1)!.push(node);
  }
  return parts;
}

function normalizeInlines(content: Inline[], report: Report): Inline[] {
  const merged: Inline[] = [];
  for (const node of content) {
    if (node.type === 'break') {
      merged.push(node);
      continue;
    }
    // Inline code keeps its spacing; whitespace-only "code" (a font leftover, e.g. Word bullets) is just space.
    const code = node.marks.code && !!node.text.trim();
    let value = code ? node.text : collapseSpaces(node.text.replace(/\n/g, ' '), report);
    // Formatting on pure whitespace is invisible noise (and breaks Markdown output).
    const marks = value.trim() ? node.marks : {};
    const previous = merged.at(-1);
    if (previous?.type === 'text') {
      if (previous.text.endsWith(' ') && value.startsWith(' ')) value = value.slice(1);
      if (sameMarks(previous.marks, marks)) {
        previous.text += value;
        continue;
      }
    }
    if (value) merged.push({ type: 'text', text: value, marks: { ...marks } });
  }

  // Trim around line starts/ends, then drop leading/trailing breaks.
  for (let i = 0; i < merged.length; i++) {
    const node = merged[i];
    if (node.type !== 'text' || node.marks.code) continue;
    const before = merged[i - 1];
    const after = merged[i + 1];
    if (!before || before.type === 'break') node.text = node.text.replace(/^ +/, '');
    if (!after || after.type === 'break') node.text = node.text.replace(/ +$/, '');
  }
  const result = merged.filter((node) => node.type === 'break' || node.text);
  while (result[0]?.type === 'break') result.shift();
  while (result.at(-1)?.type === 'break') result.pop();
  return result.filter((node, i) => !(node.type === 'break' && result[i - 1]?.type === 'break'));
}
