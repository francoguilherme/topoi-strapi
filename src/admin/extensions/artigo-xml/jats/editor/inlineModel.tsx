/**
 * Shared inline-content model (marks, links, cross-references) used by every rich-text
 * surface in the JATS editor: the single-paragraph `InlineRichEditor` and the block-level
 * `AdvancedEditor`. Kept in one place so both editors always agree on what a "bold" or a
 * "cross-reference" is, and on how they round-trip to/from the JATS DOM.
 */
import { Editor, Element as SlateElement, Range, Transforms } from 'slate';
import { RenderElementProps, RenderLeafProps, ReactEditor, useSlate } from 'slate-react';
import * as React from 'react';
import styled from 'styled-components';

import { useArtigoXmlNavigation } from '../../ArtigoXmlNavigationContext';

export const XLINK_NS = 'http://www.w3.org/1999/xlink';

export type MarkKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'sup'
  | 'sub'
  | 'strike'
  | 'smallCaps'
  | 'monospace';

export interface FormattedText {
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
  sup?: true;
  sub?: true;
  strike?: true;
  smallCaps?: true;
  monospace?: true;
}

export interface BreakElement {
  type: 'break';
  children: [FormattedText];
}

export type InlineLeaf = FormattedText | BreakElement;

export interface LinkElement {
  type: 'link';
  href: string;
  isEmail?: boolean;
  children: InlineLeaf[];
}

export interface XrefElement {
  type: 'xref';
  rid: string;
  children: InlineLeaf[];
}

export type InlineNode = FormattedText | LinkElement | XrefElement | BreakElement;

export const isFormattedText = (node: InlineNode): node is FormattedText => !('type' in node);

export const INLINE_TYPES = new Set(['link', 'xref']);
export const VOID_INLINE_TYPES = new Set(['break']);

/** Marks any editor's `link`/`xref` elements as inline and `break` as void. */
export const withInlines = <T extends Editor>(editor: T): T => {
  const { isInline, isVoid } = editor;

  editor.isInline = (element) => INLINE_TYPES.has(element.type) || isInline(element);
  editor.isVoid = (element) => VOID_INLINE_TYPES.has(element.type) || isVoid(element);

  return editor;
};

const MARK_TAG_MAP: Record<string, MarkKey> = {
  italic: 'italic',
  i: 'italic',
  bold: 'bold',
  b: 'bold',
  underline: 'underline',
  sup: 'sup',
  sub: 'sub',
  strike: 'strike',
  sc: 'smallCaps',
  monospace: 'monospace',
};

const applyTagMarks = (
  tag: string,
  marks: Partial<Record<MarkKey, true>>
): Partial<Record<MarkKey, true>> | null => {
  if (tag === 'bold-italic') {
    return { ...marks, bold: true, italic: true };
  }
  const mark = MARK_TAG_MAP[tag];
  return mark ? { ...marks, [mark]: true } : null;
};

/**
 * Walks a JATS inline node list, converting it into Slate nodes. `<xref>`/`<ext-link>`/
 * `<email>` become dedicated inline elements; every other recognized formatting tag
 * becomes a mark on the underlying text; unrecognized tags are unwrapped (dropped,
 * keeping their children) — mirroring the read-only renderer's behaviour in `inline.tsx`.
 * `allowNestedInlines` is turned off while walking inside a link/xref's own children,
 * since inline elements aren't allowed to nest inside one another here.
 */
const deserializeWalk = (
  nodes: ArrayLike<ChildNode>,
  marks: Partial<Record<MarkKey, true>>,
  allowNestedInlines: boolean
): InlineNode[] => {
  const result: InlineNode[] = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];

    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        result.push({ text: node.textContent, ...marks });
      }
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'break') {
      result.push({ type: 'break', children: [{ text: '' }] });
      continue;
    }

    if (allowNestedInlines && (tag === 'xref' || tag === 'ext-link' || tag === 'uri' || tag === 'email')) {
      const children = deserializeWalk(el.childNodes, marks, false) as InlineLeaf[];
      if (tag === 'xref') {
        result.push({ type: 'xref', rid: el.getAttribute('rid') || '', children });
      } else if (tag === 'email') {
        result.push({ type: 'link', href: `mailto:${el.textContent ?? ''}`, isEmail: true, children });
      } else {
        const href =
          el.getAttributeNS(XLINK_NS, 'href') || el.getAttribute('xlink:href') || el.getAttribute('href') || '';
        result.push({ type: 'link', href, children });
      }
      continue;
    }

    const nextMarks = applyTagMarks(tag, marks);
    result.push(...deserializeWalk(el.childNodes, nextMarks ?? marks, allowNestedInlines));
  }

  return result;
};

export const deserializeInline = (nodes: ArrayLike<ChildNode>): InlineNode[] => {
  const result = deserializeWalk(nodes, {}, true);
  return result.length > 0 ? result : [{ text: '' }];
};

const MARK_ORDER: MarkKey[] = ['monospace', 'smallCaps', 'strike', 'sub', 'sup', 'underline', 'italic', 'bold'];
const MARK_TAGS: Record<MarkKey, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  sup: 'sup',
  sub: 'sub',
  strike: 'strike',
  smallCaps: 'sc',
  monospace: 'monospace',
};

const serializeLeaf = (doc: Document, leaf: FormattedText): Node => {
  let node: Node = doc.createTextNode(leaf.text);
  MARK_ORDER.forEach((mark) => {
    if (leaf[mark]) {
      const wrapper = doc.createElement(MARK_TAGS[mark]);
      wrapper.appendChild(node);
      node = wrapper;
    }
  });
  return node;
};

const serializeInlineLeaves = (doc: Document, nodes: InlineLeaf[]): Node[] =>
  nodes
    .map((node) => (isFormattedText(node) ? (node.text ? serializeLeaf(doc, node) : null) : doc.createElement('break')))
    .filter((node): node is Node => node !== null);

/** Converts a Slate value produced by these editors back into JATS DOM nodes. */
export const serializeInline = (nodes: InlineNode[], doc: Document): Node[] => {
  const out: Node[] = [];

  nodes.forEach((node) => {
    if (isFormattedText(node)) {
      if (node.text !== '') {
        out.push(serializeLeaf(doc, node));
      }
      return;
    }

    if (node.type === 'break') {
      out.push(doc.createElement('break'));
      return;
    }

    if (node.type === 'xref') {
      const el = doc.createElement('xref');
      el.setAttribute('rid', node.rid);
      serializeInlineLeaves(doc, node.children).forEach((child) => el.appendChild(child));
      out.push(el);
      return;
    }

    const el = doc.createElement(node.isEmail ? 'email' : 'ext-link');
    if (!node.isEmail) {
      el.setAttributeNS(XLINK_NS, 'xlink:href', node.href);
    }
    serializeInlineLeaves(doc, node.children).forEach((child) => el.appendChild(child));
    out.push(el);
  });

  return out;
};

export const isMarkActive = (editor: Editor, mark: MarkKey): boolean => {
  const marks = Editor.marks(editor) as FormattedText | null;
  return marks ? marks[mark] === true : false;
};

export const toggleMark = (editor: Editor, mark: MarkKey): void => {
  if (isMarkActive(editor, mark)) {
    Editor.removeMark(editor, mark);
  } else {
    Editor.addMark(editor, mark, true);
  }
};

export const insertLink = (editor: Editor, href: string): void => {
  if (!editor.selection) {
    return;
  }

  const link: LinkElement = {
    type: 'link',
    href,
    children: [{ text: href }],
  };

  if (Range.isCollapsed(editor.selection)) {
    Transforms.insertNodes(editor, link);
  } else {
    Transforms.wrapNodes(editor, { ...link, children: [] }, { split: true });
    Transforms.collapse(editor, { edge: 'end' });
  }
};

export const insertXref = (editor: Editor, rid: string, label: string): void => {
  if (!editor.selection) {
    return;
  }

  if (Range.isCollapsed(editor.selection)) {
    Transforms.insertNodes(editor, { type: 'xref', rid, children: [{ text: label }] });
  } else {
    // Wrap the selected text itself in the xref, instead of replacing it with the
    // target's label — mirrors `insertLink`'s behaviour for a non-collapsed selection.
    Transforms.wrapNodes(editor, { type: 'xref', rid, children: [] }, { split: true });
    Transforms.collapse(editor, { edge: 'end' });
  }
};

export const removeXref = (editor: Editor, element: XrefElement): void => {
  try {
    const path = ReactEditor.findPath(editor, element);
    Transforms.unwrapNodes(editor, {
      at: path,
      match: (node) => SlateElement.isElement(node) && node.type === 'xref',
    });
  } catch {
    // The node may already have been removed by a concurrent update.
  }
};

const LinkChip: React.FC<{ href: string; children: React.ReactNode } & Record<string, unknown>> = ({
  href,
  children,
  ...attributes
}) => (
  <span
    {...attributes}
    title={href}
    style={{ color: '#4945ff', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
  >
    {children}
  </span>
);

const XrefElementView: React.FC<RenderElementProps> = ({ attributes, children, element }) => {
  const editor = useSlate();
  const navigation = useArtigoXmlNavigation();

  if (element.type !== 'xref') {
    return null;
  }

  const handleGoToRid = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    navigation?.scrollToRid(element.rid);
  };

  const handleRemove = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    removeXref(editor, element);
  };

  return (
    <XrefWrapper {...attributes} title={`Referência cruzada: ${element.rid}`}>
      {children}
      <XrefMenu contentEditable={false} suppressContentEditableWarning>
        <XrefMenuRid
          type="button"
          title={`Ir para ${element.rid}`}
          onMouseDown={handleGoToRid}
          onClick={handleGoToRid}
        >
          {element.rid}
        </XrefMenuRid>
        <XrefMenuButton type="button" onMouseDown={handleRemove}>
          Remover referência
        </XrefMenuButton>
      </XrefMenu>
    </XrefWrapper>
  );
};

/**
 * Renders the inline elements shared by every editor (`link`, `xref`, `break`). Returns
 * `null` for anything else so callers can fall through to their own (block-level)
 * `renderElement` switch.
 */
export const renderInlineElement = (props: RenderElementProps): React.ReactElement | null => {
  const { attributes, children, element } = props;
  switch (element.type) {
    case 'link':
      return (
        <LinkChip {...attributes} href={element.href}>
          {children}
        </LinkChip>
      );
    case 'xref':
      return <XrefElementView {...props} />;
    case 'break':
      return (
        <span {...attributes}>
          {children}
          <br />
        </span>
      );
    default:
      return null;
  }
};

/** Renders the marks shared by every editor onto a leaf's text. */
export const renderInlineLeaf = ({ attributes, children, leaf }: RenderLeafProps): React.ReactElement => {
  const formatted = leaf as FormattedText;
  let content = children;

  if (formatted.monospace) content = <code>{content}</code>;
  if (formatted.smallCaps) content = <span style={{ fontVariant: 'small-caps' }}>{content}</span>;
  if (formatted.strike) content = <span style={{ textDecoration: 'line-through' }}>{content}</span>;
  if (formatted.sub) content = <sub>{content}</sub>;
  if (formatted.sup) content = <sup>{content}</sup>;
  if (formatted.underline) content = <span style={{ textDecoration: 'underline' }}>{content}</span>;
  if (formatted.italic) content = <em>{content}</em>;
  if (formatted.bold) content = <strong>{content}</strong>;

  return <span {...attributes}>{content}</span>;
};

const XrefMenu = styled.span`
  display: none;
  position: absolute;
  left: 50%;
  bottom: calc(100% + 4px);
  transform: translateX(-50%);
  z-index: 5;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: #212134;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(33, 33, 52, 0.25);
  white-space: nowrap;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    height: 4px;
  }
`;

const XrefMenuRid = styled.button`
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.2;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #a5a5ba;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;

  &:hover {
    color: #fff;
    background: #32324d;
  }
`;

const XrefMenuButton = styled.button`
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.2;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  cursor: pointer;

  &:hover {
    background: #32324d;
  }
`;

const XrefWrapper = styled.span`
  position: relative;
  background: #f0f0ff;
  border-radius: 3px;
  padding: 0 3px;
  color: #4945ff;

  &:hover ${XrefMenu} {
    display: inline-flex;
  }
`;
