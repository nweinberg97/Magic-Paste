import type { Block, Inline } from './model';

type ListBlock = Extract<Block, { type: 'list' }>;

/** A list item before nesting is resolved. Both the text and HTML parsers produce these. */
export interface FlatItem {
  level: number;
  ordered: boolean;
  start?: number;
  content: Inline[];
}

/**
 * Turn a flat run of items with levels into nested list blocks.
 * Levels can only deepen one step at a time, which repairs sources (PDFs,
 * Word, Google Docs) that report jumps like level 0 → level 3.
 */
export function buildLists(items: FlatItem[]): ListBlock[] {
  const roots: ListBlock[] = [];
  const stack: { list: ListBlock; level: number }[] = [];

  const open = (item: FlatItem, level: number): void => {
    const list: ListBlock = { type: 'list', ordered: item.ordered, start: item.start ?? 1, items: [] };
    const parent = stack.at(-1);
    if (level === 0 || !parent) roots.push(list);
    else parent.list.items.at(-1)!.children.push(list);
    stack.push({ list, level });
  };

  for (const item of items) {
    const top = stack.at(-1);
    const level = Math.max(0, Math.min(item.level, top ? top.level + 1 : 0));
    while (stack.length && stack.at(-1)!.level > level) stack.pop();

    const current = stack.at(-1);
    if (current && current.level === level && current.list.ordered !== item.ordered) {
      // Same depth, different kind ("1." after "•"): a sibling list, not a child.
      stack.pop();
      open(item, level);
    } else if (!current || current.level < level) {
      open(item, level);
    }
    stack.at(-1)!.list.items.push({ content: item.content, children: [] });
  }
  return roots;
}
