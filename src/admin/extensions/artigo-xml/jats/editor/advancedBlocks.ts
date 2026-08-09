/**
 * Block-level Slate schema for the "Editor avançado" (Notion-like) body editor, plus
 * `deserializeBody`/`serializeBody` to round-trip it against the JATS `<body>` subtree.
 *
 * This is the single place where the *complete* set of Slate node types used anywhere
 * in the app is assembled and declared to `slate`'s `CustomTypes` — `InlineRichEditor`'s
 * mini single-paragraph editor only ever produces a subset of these (`paragraph` plus
 * the shared inline types), so it stays compatible without its own declaration.
 */
import { BaseEditor } from 'slate';
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

const XLINK_NS = 'http://www.w3.org/1999/xlink';

const BLOCK_TAGS = new Set(['p', 'sec', 'disp-quote', 'table-wrap', 'fig', 'list', 'boxed-text']);

const directChild = (el: Element, tag: string): Element | null =>
  Array.from(el.children).find((c) => c.tagName.toLowerCase() === tag) ?? null;

const directChildren = (el: Element, tag: string): Element[] =>
  Array.from(el.children).filter((c) => c.tagName.toLowerCase() === tag);

const isInlineEmpty = (nodes: InlineNode[]): boolean =>
  nodes.every((node) => isFormattedText(node) && !node.text.trim());

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
  children: [HeadingElement, ...BlockElement[]];
}

export interface ListItemElement {
  type: 'list-item';
  children: BlockElement[];
}

export interface ListElement {
  type: 'list';
  ordered: boolean;
  children: ListItemElement[];
}

export interface QuoteAttribElement {
  type: 'quote-attrib';
  children: InlineNode[];
}

export interface QuoteElement {
  type: 'quote';
  // JATS `<disp-quote>` may hold arbitrary block content (not just paragraphs), and the
  // slash menu can insert any block kind wherever it's triggered — so this must accept
  // any `BlockElement`, not just `ParagraphElement`, or those blocks would be silently
  // dropped on serialize.
  children: (BlockElement | QuoteAttribElement)[];
}

export interface TableElement {
  type: 'table';
  tableId: string;
  label: string;
  captionTitle: string;
  attribText: string;
  /** Snapshot of the original `<table>` (preserves thead/tbody, rowspan/colspan…); only
   * cell text is user-editable here and gets patched back into a clone of this on save. */
  tableTemplate: Element;
  rows: string[][];
  children: [FormattedText];
}

export interface FigureElement {
  type: 'figure';
  figureId: string;
  label: string;
  captionTitle: string;
  href: string;
  attribText: string;
  children: [FormattedText];
}

export interface BoxedTextElement {
  type: 'boxed-text';
  children: BlockElement[];
}

export type BlockElement =
  | ParagraphElement
  | SectionElement
  | ListElement
  | QuoteElement
  | TableElement
  | FigureElement
  | BoxedTextElement;

export type CustomElement =
  | BlockElement
  | HeadingElement
  | ListItemElement
  | QuoteAttribElement
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
  | 'bulleted-list'
  | 'numbered-list'
  | 'table'
  | 'figure'
  | 'boxed-text';

export const BLOCK_KIND_LABELS: Record<BlockKind, string> = {
  paragraph: 'Parágrafo',
  section: 'Subseção',
  quote: 'Citação em bloco',
  'bulleted-list': 'Lista com marcadores',
  'numbered-list': 'Lista numerada',
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

const rebuildTableTemplate = (rows: string[][], headerRowCount: number, base?: Element): Element => {
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
  const rows = [...element.rows, Array<string>(colCount).fill('')];
  const headerRowCount = getHeaderRowCount(element.tableTemplate);
  return { rows, tableTemplate: rebuildTableTemplate(rows, headerRowCount, element.tableTemplate) };
};

export const addTableColumn = (element: TableElement): Pick<TableElement, 'rows' | 'tableTemplate'> => {
  const rows = element.rows.map((row) => [...row, '']);
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
    case 'bulleted-list':
      return { type: 'list', ordered: false, children: [{ type: 'list-item', children: [createEmptyParagraph()] }] };
    case 'numbered-list':
      return { type: 'list', ordered: true, children: [{ type: 'list-item', children: [createEmptyParagraph()] }] };
    case 'table':
      return {
        type: 'table',
        tableId: '',
        label: '',
        captionTitle: '',
        attribText: '',
        tableTemplate: createDefaultTableTemplate(),
        rows: [['']],
        children: [{ text: '' }],
      };
    case 'figure':
      return {
        type: 'figure',
        figureId: '',
        label: '',
        captionTitle: '',
        href: '',
        attribText: '',
        children: [{ text: '' }],
      };
    case 'boxed-text':
      return { type: 'boxed-text', children: [createEmptyParagraph()] };
    default:
      return createEmptyParagraph();
  }
};

// --- Deserialize: JATS DOM -> Slate value --------------------------------------------

/** Deserializes any container's direct block children (body/boxed-text/list-item). */
const deserializeBlockList = (container: Element, depth: number): BlockElement[] => {
  const blocks = Array.from(container.children)
    .filter((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()))
    .map((el) => deserializeBlock(el, depth))
    .filter((b): b is BlockElement => b !== null);
  return blocks.length > 0 ? blocks : [createEmptyParagraph()];
};

const deserializeBlock = (el: Element, depth: number): BlockElement | null => {
  switch (el.tagName.toLowerCase()) {
    case 'p':
      return { type: 'paragraph', children: deserializeInline(el.childNodes) };
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
    default:
      return null;
  }
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

const deserializeList = (el: Element): ListElement => {
  const ordered = (el.getAttribute('list-type') || '').toLowerCase() === 'order';
  const itemEls = directChildren(el, 'list-item');
  const items: ListItemElement[] =
    itemEls.length > 0
      ? itemEls.map((item) => ({ type: 'list-item' as const, children: deserializeBlockList(item, 2) }))
      : [{ type: 'list-item', children: [createEmptyParagraph()] }];
  return { type: 'list', ordered, children: items };
};

const deserializeTable = (el: Element): TableElement => {
  const table = directChild(el, 'table');
  const caption = directChild(el, 'caption');
  const labelEl = directChild(el, 'label');
  const captionTitleEl = caption ? directChild(caption, 'title') : null;
  const foot = directChild(el, 'table-wrap-foot');
  const attribEl = foot ? directChild(foot, 'attrib') : null;
  const rowEls = table ? Array.from(table.querySelectorAll('tr')) : [];
  const rows = rowEls.map((row) => Array.from(row.children).map((cell) => cell.textContent || ''));

  return {
    type: 'table',
    tableId: el.getAttribute('id') || '',
    label: labelEl?.textContent || '',
    captionTitle: captionTitleEl?.textContent || '',
    attribText: attribEl?.textContent || '',
    tableTemplate: (table ?? createDefaultTableTemplate()).cloneNode(true) as Element,
    rows: rows.length > 0 ? rows : [['']],
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
    captionTitle: captionTitleEl?.textContent || '',
    href,
    attribText: attribEl?.textContent || '',
    children: [{ text: '' }],
  };
};

/** Deserializes an article's `<body>` element into the advanced editor's Slate value. */
export const deserializeBody = (bodyEl: Element): BlockElement[] => deserializeBlockList(bodyEl, 2);

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
    case 'figure':
      return serializeFigure(node, doc);
    case 'list':
      return serializeList(node, doc);
    case 'boxed-text': {
      const el = doc.createElement('boxed-text');
      serializeBody(node.children, doc).forEach((child) => el.appendChild(child));
      return el;
    }
    default:
      return null;
  }
};

const serializeSection = (node: SectionElement, doc: Document): Element => {
  const el = doc.createElement('sec');
  if (node.sectionId) {
    el.setAttribute('id', node.sectionId);
  }
  const [heading, ...body] = node.children;
  const title = doc.createElement('title');
  serializeInline(heading.children, doc).forEach((child) => title.appendChild(child));
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
  el.setAttribute('list-type', node.ordered ? 'order' : 'bullet');
  node.children.forEach((item) => {
    const itemEl = doc.createElement('list-item');
    serializeBody(item.children, doc).forEach((child) => itemEl.appendChild(child));
    el.appendChild(itemEl);
  });
  return el;
};

const serializeTable = (node: TableElement, doc: Document): Element => {
  const wrap = doc.createElement('table-wrap');
  if (node.tableId) {
    wrap.setAttribute('id', node.tableId);
  }
  if (node.label.trim()) {
    const label = doc.createElement('label');
    label.textContent = node.label;
    wrap.appendChild(label);
  }
  if (node.captionTitle.trim()) {
    const caption = doc.createElement('caption');
    const title = doc.createElement('title');
    title.textContent = node.captionTitle;
    caption.appendChild(title);
    wrap.appendChild(caption);
  }

  const table = doc.importNode(node.tableTemplate, true) as Element;
  Array.from(table.querySelectorAll('tr')).forEach((row, r) => {
    Array.from(row.children).forEach((cell, c) => {
      cell.textContent = node.rows[r]?.[c] ?? cell.textContent ?? '';
    });
  });
  wrap.appendChild(table);

  if (node.attribText.trim()) {
    const foot = doc.createElement('table-wrap-foot');
    const attrib = doc.createElement('attrib');
    attrib.textContent = node.attribText;
    foot.appendChild(attrib);
    wrap.appendChild(foot);
  }

  return wrap;
};

const serializeFigure = (node: FigureElement, doc: Document): Element => {
  const el = doc.createElement('fig');
  if (node.figureId) {
    el.setAttribute('id', node.figureId);
  }
  if (node.label.trim()) {
    const label = doc.createElement('label');
    label.textContent = node.label;
    el.appendChild(label);
  }
  if (node.captionTitle.trim()) {
    const caption = doc.createElement('caption');
    const title = doc.createElement('title');
    title.textContent = node.captionTitle;
    caption.appendChild(title);
    el.appendChild(caption);
  }
  const graphic = doc.createElement('graphic');
  if (node.href) {
    graphic.setAttributeNS(XLINK_NS, 'xlink:href', node.href);
  }
  el.appendChild(graphic);
  if (node.attribText.trim()) {
    const attrib = doc.createElement('attrib');
    attrib.textContent = node.attribText;
    el.appendChild(attrib);
  }
  return el;
};
