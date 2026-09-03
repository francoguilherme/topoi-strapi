/**
 * Block-level Slate schema for the "Editor avançado" (Notion-like) body editor, plus
 * `deserializeBody`/`serializeBody` to round-trip it against the JATS `<body>` subtree.
 *
 * This is the single place where the *complete* set of Slate node types used anywhere
 * in the app is assembled and declared to `slate`'s `CustomTypes` — `InlineRichEditor`'s
 * mini single-paragraph editor only ever produces a subset of these (`paragraph` plus
 * the shared inline types), so it stays compatible without its own declaration.
 */
import { BaseEditor, Editor, Transforms } from 'slate';
import { HistoryEditor } from 'slate-history';
import { ReactEditor } from 'slate-react';

import {
  deserializeInline,
  InlineNode,
  isFormattedText,
  LinkElement,
  serializeInline,
  BreakElement,
  FormattedText,
  XrefElement,
} from './inlineModel';
import { nextFreeId, XrefTarget } from './domMutations';

const isParagraphWithSingleFig = (el: Element): Element | null => {
  const elementChildren = Array.from(el.children).filter((c) => c.nodeType === Node.ELEMENT_NODE) as Element[];
  if (elementChildren.length === 1 && elementChildren[0].tagName.toLowerCase() === 'fig') {
    return elementChildren[0];
  }
  return null;
};

const collectBlockMediaIds = (nodes: BlockElement[], used: Set<string>): void => {
  nodes.forEach((node) => {
    if (node.type === 'figure' && node.figureId) {
      used.add(node.figureId);
    } else if (node.type === 'table' && node.tableId) {
      used.add(node.tableId);
    } else if (node.type === 'section') {
      collectBlockMediaIds(node.children.slice(1) as BlockElement[], used);
    } else if (node.type === 'list') {
      node.children.forEach((item) => collectBlockMediaIds(item.children, used));
    } else if (node.type === 'quote') {
      collectBlockMediaIds(
        node.children.filter((child): child is BlockElement => child.type !== 'quote-attrib'),
        used
      );
    } else if (node.type === 'boxed-text') {
      collectBlockMediaIds(node.children, used);
    }
  });
};

const nextFreeBlockId = (used: Set<string>, prefix: string): string => {
  let n = 1;
  while (used.has(`${prefix}${n}`)) {
    n += 1;
  }
  const id = `${prefix}${n}`;
  used.add(id);
  return id;
};

/** Assigns `F{n}` / `T{n}` ids to figure/table blocks that don't have one yet. */
export const ensureMediaBlockIds = (blocks: BlockElement[], doc: Document): BlockElement[] => {
  const used = new Set<string>();
  doc.querySelectorAll('[id]').forEach((el) => {
    const id = el.getAttribute('id');
    if (id) {
      used.add(id);
    }
  });
  collectBlockMediaIds(blocks, used);

  const walk = (nodes: BlockElement[]): BlockElement[] =>
    nodes.map((node) => {
      if (node.type === 'figure') {
        return { ...node, figureId: node.figureId || nextFreeBlockId(used, 'F') };
      }
      if (node.type === 'table') {
        return { ...node, tableId: node.tableId || nextFreeBlockId(used, 'T') };
      }
      if (node.type === 'section') {
        const [heading, ...rest] = node.children;
        return { ...node, children: [heading, ...walk(rest)] as SectionElement['children'] };
      }
      if (node.type === 'list') {
        return {
          ...node,
          children: node.children.map((item) => ({
            ...item,
            children: walk(item.children as BlockElement[]) as ParagraphElement[],
          })),
        };
      }
      if (node.type === 'quote') {
        return {
          ...node,
          children: node.children.map((child) =>
            child.type === 'quote-attrib' ? child : walk([child as BlockElement])[0]
          ) as QuoteElement['children'],
        };
      }
      if (node.type === 'boxed-text') {
        return { ...node, children: walk(node.children) };
      }
      return node;
    });

  return walk(blocks);
};

const walkMediaTargets = (nodes: BlockElement[], targets: XrefTarget[]): void => {
  nodes.forEach((node) => {
    if (node.type === 'figure' && node.figureId) {
      targets.push({
        id: node.figureId,
        refType: 'fig',
        label: node.label.trim() || `Figura ${node.figureId}`,
      });
    } else if (node.type === 'table' && node.tableId) {
      targets.push({
        id: node.tableId,
        refType: 'table',
        label: node.label.trim() || `Tabela ${node.tableId}`,
      });
    } else if (node.type === 'section') {
      walkMediaTargets(node.children.slice(1) as BlockElement[], targets);
    } else if (node.type === 'list') {
      node.children.forEach((item) => walkMediaTargets(item.children, targets));
    } else if (node.type === 'quote') {
      walkMediaTargets(
        node.children.filter((child): child is BlockElement => child.type !== 'quote-attrib'),
        targets
      );
    } else if (node.type === 'boxed-text') {
      walkMediaTargets(node.children, targets);
    }
  });
};

/** Collects figure/table xref targets from a Slate body value (includes uncommitted blocks). */
export const collectMediaXrefTargets = (blocks: BlockElement[]): XrefTarget[] => {
  const targets: XrefTarget[] = [];
  walkMediaTargets(blocks, targets);
  return targets;
};

/** Returns the next free media id for a newly inserted figure or table block. */
export const nextMediaBlockId = (doc: Document, kind: 'figure' | 'table'): string =>
  nextFreeId(doc, kind === 'figure' ? 'F' : 'T');

/** Writes auto-assigned figure/table ids back into the live Slate document. */
export const syncMediaBlockIdsToEditor = (
  editor: Editor,
  before: BlockElement[],
  after: BlockElement[]
): void => {
  const syncWalk = (bNodes: BlockElement[], aNodes: BlockElement[], basePath: number[]): void => {
    const limit = Math.min(bNodes.length, aNodes.length);
    for (let i = 0; i < limit; i += 1) {
      const bNode = bNodes[i];
      const aNode = aNodes[i];
      const path = [...basePath, i];

      if (bNode.type === 'figure' && aNode.type === 'figure' && !bNode.figureId && aNode.figureId) {
        try {
          Transforms.setNodes(editor, { figureId: aNode.figureId }, { at: path });
        } catch {
          // Node may have been removed by a concurrent update.
        }
      }
      if (bNode.type === 'table' && aNode.type === 'table' && !bNode.tableId && aNode.tableId) {
        try {
          Transforms.setNodes(editor, { tableId: aNode.tableId }, { at: path });
        } catch {
          // Node may have been removed by a concurrent update.
        }
      }

      if (bNode.type === 'section' && aNode.type === 'section') {
        syncWalk(
          bNode.children.slice(1) as BlockElement[],
          aNode.children.slice(1) as BlockElement[],
          [...path, 1]
        );
      } else if (bNode.type === 'list' && aNode.type === 'list') {
        bNode.children.forEach((bItem, j) => {
          const aItem = aNode.children[j];
          if (aItem) {
            syncWalk(bItem.children, aItem.children, [...path, j]);
          }
        });
      } else if (bNode.type === 'quote' && aNode.type === 'quote') {
        syncWalk(
          bNode.children.filter((child): child is BlockElement => child.type !== 'quote-attrib'),
          aNode.children.filter((child): child is BlockElement => child.type !== 'quote-attrib'),
          path
        );
      } else if (bNode.type === 'boxed-text' && aNode.type === 'boxed-text') {
        syncWalk(bNode.children, aNode.children, path);
      }
    }
  };

  syncWalk(before, after, []);
};

/** Empty inline run used for blank table cells / attrib notes. */
export const createEmptyInline = (): InlineNode[] => [{ text: '' }];

const XLINK_NS = 'http://www.w3.org/1999/xlink';

const BLOCK_TAGS = new Set(['p', 'sec', 'disp-quote', 'table-wrap', 'fig', 'list', 'boxed-text', 'verse-group']);

const directChild = (el: Element, tag: string): Element | null =>
  Array.from(el.children).find((c) => c.tagName.toLowerCase() === tag) ?? null;

const directChildren = (el: Element, tag: string): Element[] =>
  Array.from(el.children).filter((c) => c.tagName.toLowerCase() === tag);

const localTag = (el: Element): string => (el.localName || el.tagName).toLowerCase();

const paragraphNestedBlockChildren = (el: Element): Element[] =>
  Array.from(el.children).filter((child) => {
    const tag = localTag(child);
    return BLOCK_TAGS.has(tag) && tag !== 'p';
  });

const isInlineEmpty = (nodes: InlineNode[]): boolean =>
  nodes.every((node) => isFormattedText(node) && !node.text.trim());

export { isInlineEmpty };

// --- Slate element schema -----------------------------------------------------------

export interface ParagraphElement {
  type: 'paragraph';
  children: InlineNode[];
}

export interface HeadingElement {
  type: 'heading';
  depth: number;
  children: InlineNode[];
}

export interface SectionElement {
  type: 'section';
  depth: number;
  sectionId?: string;
  /** JATS `sec-type` attribute (e.g. `conclusions`). */
  secType?: string;
  children: [HeadingElement, ...BlockElement[]];
}

export type ListType = 'simple' | 'bullet';

export interface ListItemElement {
  type: 'list-item';
  children: ParagraphElement[];
}

export interface ListElement {
  type: 'list';
  listType: ListType;
  children: ListItemElement[];
}

export interface QuoteAttribElement {
  type: 'quote-attrib';
  children: InlineNode[];
}

export interface QuoteElement {
  type: 'quote';
  // Editor UX restricts quotes to plain paragraphs (+ optional attribution), but the
  // type still accepts `BlockElement` so older/imported JATS with nested blocks
  // round-trips without being silently dropped on serialize.
  children: (BlockElement | QuoteAttribElement)[];
}

export interface TableElement {
  type: 'table';
  tableId: string;
  label: string;
  captionTitle: InlineNode[];
  /** Table note (`table-wrap-foot` / `attrib`) — rich inline content. */
  attrib: InlineNode[];
  /** Snapshot of the original `<table>` (preserves thead/tbody, rowspan/colspan…); only
   * cell content is user-editable here and gets patched back into a clone of this on save. */
  tableTemplate: Element;
  /** Cell contents as rich inline runs (row → column → inline nodes). */
  rows: InlineNode[][][];
  children: [FormattedText];
}

export interface FigureElement {
  type: 'figure';
  figureId: string;
  label: string;
  captionTitle: InlineNode[];
  href: string;
  /** Figure note (`attrib`) — rich inline content. */
  attrib: InlineNode[];
  children: [FormattedText];
}

export interface BoxedTextElement {
  type: 'boxed-text';
  children: BlockElement[];
}

export interface VerseLineElement {
  type: 'verse-line';
  children: InlineNode[];
}

export interface VerseAttribElement {
  type: 'verse-attrib';
  children: InlineNode[];
}

export interface VerseGroupElement {
  type: 'verse-group';
  children: (VerseLineElement | VerseAttribElement)[];
}

export type BlockElement =
  | ParagraphElement
  | SectionElement
  | ListElement
  | QuoteElement
  | TableElement
  | FigureElement
  | BoxedTextElement
  | VerseGroupElement;

export type CustomElement =
  | BlockElement
  | HeadingElement
  | ListItemElement
  | QuoteAttribElement
  | VerseLineElement
  | VerseAttribElement
  | LinkElement
  | XrefElement
  | BreakElement;

declare module 'slate' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor;
    Element: CustomElement;
    Text: FormattedText;
  }
}

/** The block types selectable from the slash menu / add-block button. */
export type BlockKind =
  | 'paragraph'
  | 'section'
  | 'quote'
  | 'verse-group'
  | 'simple-list'
  | 'bulleted-list'
  | 'table'
  | 'figure'
  | 'boxed-text';

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  paragraph: 'Parágrafo',
  section: 'Seção',
  quote: 'Citação em bloco',
  'verse-group': 'Estrofe',
  'simple-list': 'Lista simples',
  'bulleted-list': 'Lista com marcadores',
  table: 'Tabela',
  figure: 'Figura',
  'boxed-text': 'Quadro destacado',
};

const createDefaultTableTemplate = (): Element =>
  new DOMParser().parseFromString('<table><tr><td/></tr></table>', 'application/xml').documentElement;

/** Number of `<thead>` rows in a table template (0 when all rows live in `<tbody>`). */
export const getHeaderRowCount = (table: Element): number => {
  const thead = table.querySelector('thead');
  return thead ? thead.querySelectorAll(':scope > tr').length : 0;
};

const rebuildTableTemplate = (rows: InlineNode[][][], headerRowCount: number, base?: Element): Element => {
  const doc = base?.ownerDocument ?? new DOMParser().parseFromString('<table/>', 'application/xml');
  const table = doc.createElement('table');
  if (base) {
    Array.from(base.attributes).forEach((attr) => {
      table.setAttribute(attr.name, attr.value);
    });
  }

  const appendRow = (parent: Element, colCount: number, cellTag: 'th' | 'td') => {
    const tr = doc.createElement('tr');
    for (let c = 0; c < colCount; c += 1) {
      tr.appendChild(doc.createElement(cellTag));
    }
    parent.appendChild(tr);
  };

  const colCount = rows.reduce((max, row) => Math.max(max, row.length), 1);

  if (headerRowCount > 0) {
    const thead = doc.createElement('thead');
    for (let r = 0; r < headerRowCount; r += 1) {
      appendRow(thead, rows[r]?.length ?? colCount, 'th');
    }
    table.appendChild(thead);
  }

  const tbody = doc.createElement('tbody');
  for (let r = headerRowCount; r < rows.length; r += 1) {
    appendRow(tbody, rows[r]?.length ?? colCount, 'td');
  }
  table.appendChild(tbody);

  return table;
};

export const addTableRow = (element: TableElement): Pick<TableElement, 'rows' | 'tableTemplate'> => {
  const colCount = element.rows.reduce((max, row) => Math.max(max, row.length), 1);
  const rows = [...element.rows, Array.from({ length: colCount }, () => createEmptyInline())];
  const headerRowCount = getHeaderRowCount(element.tableTemplate);
  return { rows, tableTemplate: rebuildTableTemplate(rows, headerRowCount, element.tableTemplate) };
};

export const addTableColumn = (element: TableElement): Pick<TableElement, 'rows' | 'tableTemplate'> => {
  const rows = element.rows.map((row) => [...row, createEmptyInline()]);
  const headerRowCount = getHeaderRowCount(element.tableTemplate);
  return { rows, tableTemplate: rebuildTableTemplate(rows, headerRowCount, element.tableTemplate) };
};

export const removeTableRow = (element: TableElement): Pick<TableElement, 'rows' | 'tableTemplate'> | null => {
  if (element.rows.length <= 1) {
    return null;
  }
  const rows = element.rows.slice(0, -1);
  const headerRowCount = Math.min(getHeaderRowCount(element.tableTemplate), rows.length);
  return { rows, tableTemplate: rebuildTableTemplate(rows, headerRowCount, element.tableTemplate) };
};

export const removeTableColumn = (element: TableElement): Pick<TableElement, 'rows' | 'tableTemplate'> | null => {
  const colCount = element.rows.reduce((max, row) => Math.max(max, row.length), 1);
  if (colCount <= 1) {
    return null;
  }
  const rows = element.rows.map((row) => row.slice(0, -1));
  const headerRowCount = getHeaderRowCount(element.tableTemplate);
  return { rows, tableTemplate: rebuildTableTemplate(rows, headerRowCount, element.tableTemplate) };
};

/** Toggles whether the first row is rendered as a `<thead>` header row. */
export const setTableHeaderRow = (
  element: TableElement,
  enabled: boolean
): Pick<TableElement, 'rows' | 'tableTemplate'> => ({
  rows: element.rows,
  tableTemplate: rebuildTableTemplate(element.rows, enabled ? 1 : 0, element.tableTemplate),
});

export const createEmptyParagraph = (): ParagraphElement => ({ type: 'paragraph', children: [{ text: '' }] });

export const createEmptyVerseLine = (): VerseLineElement => ({ type: 'verse-line', children: [{ text: '' }] });

/** Builds a fresh, empty block of `kind`, used by the slash menu and the "+" button. */
export const createEmptyBlock = (kind: BlockKind, depth: number): BlockElement => {
  switch (kind) {
    case 'paragraph':
      return createEmptyParagraph();
    case 'section':
      return {
        type: 'section',
        depth,
        children: [{ type: 'heading', depth, children: [{ text: '' }] }, createEmptyParagraph()],
      };
    case 'quote':
      return { type: 'quote', children: [createEmptyParagraph()] };
    case 'verse-group':
      return { type: 'verse-group', children: [createEmptyVerseLine()] };
    case 'simple-list':
      return { type: 'list', listType: 'simple', children: [{ type: 'list-item', children: [createEmptyParagraph()] }] };
    case 'bulleted-list':
      return { type: 'list', listType: 'bullet', children: [{ type: 'list-item', children: [createEmptyParagraph()] }] };
    case 'table':
      return {
        type: 'table',
        tableId: '',
        label: '',
        captionTitle: createEmptyInline(),
        attrib: createEmptyInline(),
        tableTemplate: createDefaultTableTemplate(),
        rows: [[createEmptyInline()]],
        children: [{ text: '' }],
      };
    case 'figure':
      return {
        type: 'figure',
        figureId: '',
        label: '',
        captionTitle: createEmptyInline(),
        href: '',
        attrib: createEmptyInline(),
        children: [{ text: '' }],
      };
    case 'boxed-text':
      return { type: 'boxed-text', children: [createEmptyParagraph()] };
    default:
      return createEmptyParagraph();
  }
};

// --- Deserialize: JATS DOM -> Slate value --------------------------------------------

/** Expands a `<p>` that may wrap block elements (e.g. `<p><list>…</list></p>`) into blocks. */
const deserializeParagraphOrBlocks = (el: Element, depth: number): BlockElement[] => {
  const figEl = isParagraphWithSingleFig(el);
  if (figEl) {
    return [deserializeFigure(figEl)];
  }

  if (paragraphNestedBlockChildren(el).length === 0) {
    return [{ type: 'paragraph', children: deserializeInline(el.childNodes) }];
  }

  const blocks: BlockElement[] = [];
  let pendingInline: ChildNode[] = [];

  const flushInline = () => {
    const hasContent = pendingInline.some(
      (node) =>
        (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) ||
        node.nodeType === Node.ELEMENT_NODE
    );
    if (hasContent) {
      blocks.push({ type: 'paragraph', children: deserializeInline(pendingInline) });
    }
    pendingInline = [];
  };

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      const tag = localTag(child);
      if (BLOCK_TAGS.has(tag) && tag !== 'p') {
        flushInline();
        const block = deserializeBlock(child, depth);
        if (block) {
          blocks.push(block);
        }
        continue;
      }
    }
    pendingInline.push(node);
  }
  flushInline();

  return blocks.length > 0 ? blocks : [{ type: 'paragraph', children: deserializeInline(el.childNodes) }];
};

/** Deserializes any container's direct block children (body/boxed-text/list-item). */
const deserializeBlockList = (container: Element, depth: number): BlockElement[] => {
  const blocks: BlockElement[] = [];
  for (const child of Array.from(container.children)) {
    const tag = localTag(child);
    if (tag === 'p') {
      blocks.push(...deserializeParagraphOrBlocks(child, depth));
    } else if (BLOCK_TAGS.has(tag)) {
      const block = deserializeBlock(child, depth);
      if (block) {
        blocks.push(block);
      }
    }
  }
  return blocks.length > 0 ? blocks : [createEmptyParagraph()];
};

const deserializeBlock = (el: Element, depth: number): BlockElement | null => {
  switch (el.tagName.toLowerCase()) {
    case 'p': {
      const figEl = isParagraphWithSingleFig(el);
      if (figEl) {
        return deserializeFigure(figEl);
      }
      return { type: 'paragraph', children: deserializeInline(el.childNodes) };
    }
    case 'sec':
      return deserializeSection(el, depth);
    case 'disp-quote':
      return deserializeQuote(el);
    case 'table-wrap':
      return deserializeTable(el);
    case 'fig':
      return deserializeFigure(el);
    case 'list':
      return deserializeList(el);
    case 'boxed-text':
      return { type: 'boxed-text', children: deserializeBlockList(el, depth) };
    case 'verse-group':
      return deserializeVerseGroup(el);
    default:
      return null;
  }
};

const deserializeVerseGroup = (el: Element): VerseGroupElement => {
  const lineEls = directChildren(el, 'verse-line');
  const children: (VerseLineElement | VerseAttribElement)[] =
    lineEls.length > 0
      ? lineEls.map((line) => ({
          type: 'verse-line' as const,
          children: deserializeInline(line.childNodes),
        }))
      : [createEmptyVerseLine()];
  const attrib = directChild(el, 'attrib');
  if (attrib) {
    children.push({ type: 'verse-attrib', children: deserializeInline(attrib.childNodes) });
  }
  return { type: 'verse-group', children };
};

const deserializeSection = (el: Element, depth: number): SectionElement => {
  const titleEl = directChild(el, 'title');
  const heading: HeadingElement = {
    type: 'heading',
    depth,
    children: titleEl ? deserializeInline(titleEl.childNodes) : [{ text: '' }],
  };
  return {
    type: 'section',
    depth,
    sectionId: el.getAttribute('id') || undefined,
    secType: el.getAttribute('sec-type') || undefined,
    children: [heading, ...deserializeBlockList(el, depth + 1)],
  };
};

const deserializeQuote = (el: Element): QuoteElement => {
  const attrib = directChild(el, 'attrib');
  const children: (BlockElement | QuoteAttribElement)[] = deserializeBlockList(el, 2);
  if (attrib) {
    children.push({ type: 'quote-attrib', children: deserializeInline(attrib.childNodes) });
  }
  return { type: 'quote', children };
};

const deserializeListItem = (item: Element): ListItemElement => {
  const pEl = directChild(item, 'p');
  const paragraph: ParagraphElement = pEl
    ? { type: 'paragraph', children: deserializeInline(pEl.childNodes) }
    : createEmptyParagraph();
  return { type: 'list-item', children: [paragraph] };
};

const deserializeList = (el: Element): ListElement => {
  const rawType = (el.getAttribute('list-type') || '').toLowerCase();
  const listType: ListType = rawType === 'bullet' ? 'bullet' : 'simple';
  const itemEls = directChildren(el, 'list-item');
  const items: ListItemElement[] =
    itemEls.length > 0 ? itemEls.map(deserializeListItem) : [{ type: 'list-item', children: [createEmptyParagraph()] }];
  return { type: 'list', listType, children: items };
};

const deserializeTable = (el: Element): TableElement => {
  const table = directChild(el, 'table');
  const caption = directChild(el, 'caption');
  const labelEl = directChild(el, 'label');
  const captionTitleEl = caption ? directChild(caption, 'title') : null;
  const foot = directChild(el, 'table-wrap-foot');
  const attribEl = foot ? directChild(foot, 'attrib') : null;
  const rowEls = table ? Array.from(table.querySelectorAll('tr')) : [];
  const rows = rowEls.map((row) =>
    Array.from(row.children).map((cell) => deserializeInline(cell.childNodes))
  );

  return {
    type: 'table',
    tableId: el.getAttribute('id') || '',
    label: labelEl?.textContent || '',
    captionTitle: captionTitleEl ? deserializeInline(captionTitleEl.childNodes) : createEmptyInline(),
    attrib: attribEl ? deserializeInline(attribEl.childNodes) : createEmptyInline(),
    tableTemplate: (table ?? createDefaultTableTemplate()).cloneNode(true) as Element,
    rows: rows.length > 0 ? rows : [[createEmptyInline()]],
    children: [{ text: '' }],
  };
};

const deserializeFigure = (el: Element): FigureElement => {
  const caption = directChild(el, 'caption');
  const graphic = directChild(el, 'graphic');
  const labelEl = directChild(el, 'label');
  const captionTitleEl = caption ? directChild(caption, 'title') : null;
  const attribEl = directChild(el, 'attrib');
  const href = graphic
    ? graphic.getAttributeNS(XLINK_NS, 'href') || graphic.getAttribute('xlink:href') || ''
    : '';

  return {
    type: 'figure',
    figureId: el.getAttribute('id') || '',
    label: labelEl?.textContent || '',
    captionTitle: captionTitleEl ? deserializeInline(captionTitleEl.childNodes) : createEmptyInline(),
    href,
    attrib: attribEl ? deserializeInline(attribEl.childNodes) : createEmptyInline(),
    children: [{ text: '' }],
  };
};

/** Deserializes an article's `<body>` element into the advanced editor's Slate value. */
export const deserializeBody = (bodyEl: Element): BlockElement[] => deserializeBlockList(bodyEl, 2);

/** Block tags allowed as direct children of `<fn>` (footnote body). */
export const FN_BLOCK_TAGS = new Set(['p', 'list']);

/** Block kinds insertable in footnote content via slash menu. */
export type FootnoteBlockKind = 'simple-list' | 'bulleted-list';

export const FOOTNOTE_BLOCK_KINDS: FootnoteBlockKind[] = ['simple-list', 'bulleted-list'];

/** Deserializes a footnote's block content (`<p>` and `<list>` only, excluding `<label>`). */
export const deserializeFnContent = (fn: Element): BlockElement[] => {
  const blocks: BlockElement[] = [];
  for (const child of Array.from(fn.children)) {
    const tag = localTag(child);
    if (tag === 'label') {
      continue;
    }
    if (tag === 'p') {
      blocks.push(...deserializeParagraphOrBlocks(child, 2));
    } else if (tag === 'list') {
      blocks.push(deserializeList(child));
    }
  }
  return blocks.length > 0 ? blocks : [createEmptyParagraph()];
};

/** Replaces a footnote's block content while preserving its `<label>`. */
export const replaceFnContent = (fn: Element, blocks: BlockElement[], doc: Document): void => {
  const label = directChild(fn, 'label');
  const content = blocks
    .filter((b): b is ParagraphElement | ListElement => b.type === 'paragraph' || b.type === 'list')
    .flatMap((node) => serializeBody([node], doc));
  fn.replaceChildren(...(label ? [label] : []), ...content);
};

// --- Serialize: Slate value -> JATS DOM ----------------------------------------------

export const serializeBody = (nodes: BlockElement[], doc: Document): Node[] =>
  nodes.map((node) => serializeBlock(node, doc)).filter((n): n is Node => n !== null);

const serializeBlock = (node: BlockElement, doc: Document): Node | null => {
  switch (node.type) {
    case 'paragraph': {
      const p = doc.createElement('p');
      serializeInline(node.children, doc).forEach((child) => p.appendChild(child));
      return p;
    }
    case 'section':
      return serializeSection(node, doc);
    case 'quote':
      return serializeQuote(node, doc);
    case 'table':
      return serializeTable(node, doc);
    case 'figure': {
      const p = doc.createElement('p');
      p.appendChild(serializeFigureElement(node, doc));
      return p;
    }
    case 'list':
      return serializeList(node, doc);
    case 'boxed-text': {
      const el = doc.createElement('boxed-text');
      serializeBody(node.children, doc).forEach((child) => el.appendChild(child));
      return el;
    }
    case 'verse-group':
      return serializeVerseGroup(node, doc);
    default:
      return null;
  }
};

const serializeVerseGroup = (node: VerseGroupElement, doc: Document): Element => {
  const el = doc.createElement('verse-group');
  node.children
    .filter((child): child is VerseLineElement => child.type === 'verse-line')
    .forEach((line) => {
      const lineEl = doc.createElement('verse-line');
      serializeInline(line.children, doc).forEach((child) => lineEl.appendChild(child));
      el.appendChild(lineEl);
    });
  const attribNode = node.children.find(
    (child): child is VerseAttribElement => child.type === 'verse-attrib'
  );
  if (attribNode && !isInlineEmpty(attribNode.children)) {
    const attrib = doc.createElement('attrib');
    serializeInline(attribNode.children, doc).forEach((child) => attrib.appendChild(child));
    el.appendChild(attrib);
  }
  return el;
};

const serializeSection = (node: SectionElement, doc: Document): Element => {
  const el = doc.createElement('sec');
  if (node.sectionId) {
    el.setAttribute('id', node.sectionId);
  }
  if (node.secType) {
    el.setAttribute('sec-type', node.secType);
  }

  // Defensive: `withSections`' `normalizeNode` guarantees `children[0]` is always the
  // `heading`, but this is the last line of defense before export — if that invariant
  // were ever violated (a bug, a future code path bypassing the editor's own
  // normalization…), treat the whole thing as body content under an empty `<title>`
  // rather than silently serializing an arbitrary content block as the section's title.
  const [firstChild, ...rest] = node.children;
  const heading = firstChild.type === 'heading' ? firstChild : null;
  const body: BlockElement[] = heading ? rest : (node.children as unknown as BlockElement[]);

  const title = doc.createElement('title');
  if (heading) {
    serializeInline(heading.children, doc).forEach((child) => title.appendChild(child));
  }
  el.appendChild(title);
  serializeBody(body, doc).forEach((child) => el.appendChild(child));
  return el;
};

const serializeQuote = (node: QuoteElement, doc: Document): Element => {
  const el = doc.createElement('disp-quote');

  const blockChildren = node.children.filter(
    (child): child is BlockElement => child.type !== 'quote-attrib'
  );
  serializeBody(blockChildren, doc).forEach((child) => el.appendChild(child));

  const attribNode = node.children.find(
    (child): child is QuoteAttribElement => child.type === 'quote-attrib'
  );
  if (attribNode && !isInlineEmpty(attribNode.children)) {
    const attrib = doc.createElement('attrib');
    serializeInline(attribNode.children, doc).forEach((n) => attrib.appendChild(n));
    el.appendChild(attrib);
  }

  return el;
};

const serializeList = (node: ListElement, doc: Document): Element => {
  const el = doc.createElement('list');
  el.setAttribute('list-type', node.listType);
  node.children.forEach((item) => {
    const itemEl = doc.createElement('list-item');
    const paragraph = item.children[0] ?? createEmptyParagraph();
    const p = doc.createElement('p');
    serializeInline(paragraph.children, doc).forEach((child) => p.appendChild(child));
    itemEl.appendChild(p);
    el.appendChild(itemEl);
  });
  return el;
};

const serializeTable = (node: TableElement, doc: Document): Element => {
  const wrap = doc.createElement('table-wrap');
  wrap.setAttribute('id', node.tableId || nextFreeId(doc, 'T'));
  if (node.label.trim()) {
    const label = doc.createElement('label');
    label.textContent = node.label;
    wrap.appendChild(label);
  }
  if (!isInlineEmpty(node.captionTitle)) {
    const caption = doc.createElement('caption');
    const title = doc.createElement('title');
    serializeInline(node.captionTitle, doc).forEach((child) => title.appendChild(child));
    caption.appendChild(title);
    wrap.appendChild(caption);
  }

  const table = doc.importNode(node.tableTemplate, true) as Element;
  Array.from(table.querySelectorAll('tr')).forEach((row, r) => {
    Array.from(row.children).forEach((cell, c) => {
      const inline = node.rows[r]?.[c] ?? createEmptyInline();
      cell.replaceChildren(...serializeInline(inline, doc));
    });
  });
  wrap.appendChild(table);

  if (!isInlineEmpty(node.attrib)) {
    const foot = doc.createElement('table-wrap-foot');
    const attrib = doc.createElement('attrib');
    serializeInline(node.attrib, doc).forEach((child) => attrib.appendChild(child));
    foot.appendChild(attrib);
    wrap.appendChild(foot);
  }

  return wrap;
};

const serializeFigureElement = (node: FigureElement, doc: Document): Element => {
  const el = doc.createElement('fig');
  el.setAttribute('id', node.figureId || nextFreeId(doc, 'F'));
  if (node.label.trim()) {
    const label = doc.createElement('label');
    label.textContent = node.label;
    el.appendChild(label);
  }
  if (!isInlineEmpty(node.captionTitle)) {
    const caption = doc.createElement('caption');
    const title = doc.createElement('title');
    serializeInline(node.captionTitle, doc).forEach((child) => title.appendChild(child));
    caption.appendChild(title);
    el.appendChild(caption);
  }
  const graphic = doc.createElement('graphic');
  if (node.href) {
    graphic.setAttributeNS(XLINK_NS, 'xlink:href', node.href);
  }
  el.appendChild(graphic);
  if (!isInlineEmpty(node.attrib)) {
    const attrib = doc.createElement('attrib');
    serializeInline(node.attrib, doc).forEach((child) => attrib.appendChild(child));
    el.appendChild(attrib);
  }
  return el;
};
