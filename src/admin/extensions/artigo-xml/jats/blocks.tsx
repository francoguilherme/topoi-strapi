import * as React from 'react';

import { useFigureHrefResolver } from '../FigureAssetsContext';
import { renderInlineNodes } from './inline';
import {
  AttribText,
  BoxedText,
  Blockquote,
  CaptionHeading,
  FigureWrapper,
  ListBlock,
  ListItem,
  SectionHeading,
  TableWrapper,
  VerseGroup,
  VerseLine,
} from './styles';

const BLOCK_TAGS = new Set([
  'p',
  'sec',
  'list',
  'table-wrap',
  'fig',
  'disp-quote',
  'boxed-text',
  'verse-group',
]);

const directChild = (el: Element, tagName: string): Element | null => {
  for (const child of Array.from(el.children)) {
    if (localTag(child) === tagName) {
      return child;
    }
  }
  return null;
};

const localTag = (el: Element): string => (el.localName || el.tagName).toLowerCase();

const paragraphNestedBlockChildren = (el: Element): Element[] =>
  Array.from(el.children).filter((child) => {
    const tag = localTag(child);
    return BLOCK_TAGS.has(tag) && tag !== 'p';
  });

const XLINK_NS = 'http://www.w3.org/1999/xlink';

const getGraphicHref = (el: Element): string | null =>
  el.getAttributeNS(XLINK_NS, 'href') || el.getAttribute('xlink:href') || el.getAttribute('href');

/** JATS often wraps `<fig>` in a `<p>`; detect that pattern for block-level rendering. */
const singleFigChild = (el: Element): Element | null => {
  const elementChildren = Array.from(el.children).filter(
    (c) => c.nodeType === Node.ELEMENT_NODE
  ) as Element[];
  if (elementChildren.length === 1 && elementChildren[0].tagName.toLowerCase() === 'fig') {
    return elementChildren[0];
  }
  return null;
};

/**
 * Renders a sequence of JATS block-level nodes (as found directly under
 * <body>, <sec>, <disp-quote>, <boxed-text>, list items, table cells...).
 */
export const renderBlockNodes = (
  nodes: ArrayLike<ChildNode>,
  keyPrefix: string,
  depth = 2
): React.ReactNode[] => {
  const result: React.ReactNode[] = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const el = node as Element;
    const key = `${keyPrefix}-${i}`;
    const rendered = renderBlockElement(el, key, depth);
    if (rendered !== null) {
      result.push(rendered);
    }
  }

  return result;
};

/** Renders the content of a cell/item that may hold either inline text or block content. */
const renderMixedContent = (el: Element, keyPrefix: string, depth: number): React.ReactNode => {
  const hasBlockChild = paragraphNestedBlockChildren(el).length > 0;

  return hasBlockChild
    ? renderBlockNodes(el.childNodes, keyPrefix, depth)
    : renderInlineNodes(el.childNodes, keyPrefix);
};

/** Renders a `<p>` that may contain block-level children such as `<list>`. */
const renderParagraphContent = (el: Element, key: string, depth: number): React.ReactNode => {
  const figEl = singleFigChild(el);
  if (figEl) {
    return <Figure key={key} el={figEl} keyPrefix={key} />;
  }

  if (paragraphNestedBlockChildren(el).length === 0) {
    return <p key={key}>{renderInlineNodes(el.childNodes, key)}</p>;
  }

  const parts: React.ReactNode[] = [];
  let inlineNodes: ChildNode[] = [];
  let partIndex = 0;

  const flushInline = () => {
    const hasContent = inlineNodes.some(
      (node) =>
        (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) ||
        node.nodeType === Node.ELEMENT_NODE
    );
    if (hasContent) {
      parts.push(
        <p key={`${key}-p-${partIndex}`}>{renderInlineNodes(inlineNodes, `${key}-p-${partIndex}`)}</p>
      );
      partIndex += 1;
    }
    inlineNodes = [];
  };

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      const tag = localTag(child);
      if (BLOCK_TAGS.has(tag) && tag !== 'p') {
        flushInline();
        const rendered = renderBlockElement(child, `${key}-blk-${partIndex}`, depth);
        if (rendered !== null) {
          parts.push(rendered);
          partIndex += 1;
        }
        continue;
      }
    }
    inlineNodes.push(node);
  }
  flushInline();

  if (parts.length === 1) {
    return parts[0];
  }
  return <React.Fragment key={key}>{parts}</React.Fragment>;
};

const renderBlockElement = (el: Element, key: string, depth: number): React.ReactNode => {
  const tag = localTag(el);

  switch (tag) {
    // Consumed by their parent element when it renders itself; skip if
    // ever encountered while walking a generic node list.
    case 'title':
    case 'label':
    case 'caption':
    case 'table-wrap-foot':
    case 'attrib':
      return null;

    case 'p':
      return renderParagraphContent(el, key, depth);

    case 'sec':
      return <Section key={key} el={el} keyPrefix={key} depth={depth} />;

    case 'disp-quote': {
      const attrib = directChild(el, 'attrib');
      const contentNodes = Array.from(el.childNodes).filter(
        (child) => !(child.nodeType === Node.ELEMENT_NODE && (child as Element) === attrib)
      );
      return (
        <Blockquote key={key}>
          {renderBlockNodes(contentNodes, key, depth)}
          {attrib && <AttribText>{renderInlineNodes(attrib.childNodes, `${key}-attrib`)}</AttribText>}
        </Blockquote>
      );
    }

    case 'boxed-text':
      return <BoxedText key={key}>{renderBlockNodes(el.childNodes, key, depth)}</BoxedText>;

    case 'verse-group': {
      const attrib = directChild(el, 'attrib');
      const lines = Array.from(el.children).filter(
        (child) => child.tagName.toLowerCase() === 'verse-line'
      );
      if (lines.length === 0) {
        return null;
      }
      return (
        <VerseGroup key={key}>
          {lines.map((line, index) => (
            <VerseLine key={`${key}-vl-${index}`}>
              {renderInlineNodes(line.childNodes, `${key}-vl-${index}`)}
            </VerseLine>
          ))}
          {attrib && <AttribText>{renderInlineNodes(attrib.childNodes, `${key}-attrib`)}</AttribText>}
        </VerseGroup>
      );
    }

    case 'list': {
      const bulleted = (el.getAttribute('list-type') || '').toLowerCase() === 'bullet';
      const items = Array.from(el.children).filter((c) => localTag(c) === 'list-item');
      return (
        <ListBlock key={key} $bulleted={bulleted}>
          {items.map((item, index) => {
            const pEl = directChild(item, 'p');
            return (
              <ListItem key={`${key}-li-${index}`}>
                {pEl
                  ? renderInlineNodes(pEl.childNodes, `${key}-li-${index}`)
                  : renderMixedContent(item, `${key}-li-${index}`, depth)}
              </ListItem>
            );
          })}
        </ListBlock>
      );
    }

    case 'table-wrap':
      return <TableWrap key={key} el={el} keyPrefix={key} />;

    case 'fig':
      return <Figure key={key} el={el} keyPrefix={key} />;

    default: {
      // Unknown element: if it wraps recognizable block content, unwrap it;
      // otherwise treat it as a paragraph so nothing is silently dropped.
      const hasBlockChild = paragraphNestedBlockChildren(el).length > 0;
      if (hasBlockChild) {
        return <React.Fragment key={key}>{renderBlockNodes(el.childNodes, key, depth)}</React.Fragment>;
      }
      if (!el.textContent?.trim()) {
        return null;
      }
      return <p key={key}>{renderInlineNodes(el.childNodes, key)}</p>;
    }
  }
};

const Section: React.FC<{ el: Element; keyPrefix: string; depth: number }> = ({
  el,
  keyPrefix,
  depth,
}) => {
  const titleEl = directChild(el, 'title');
  const headingDepth = Math.min(depth, 4);
  const headingTag = headingDepth <= 2 ? 'h2' : headingDepth === 3 ? 'h3' : 'h4';
  const otherChildren = Array.from(el.childNodes).filter(
    (child) => !(child.nodeType === Node.ELEMENT_NODE && (child as Element) === titleEl)
  );

  return (
    <section id={el.getAttribute('id') || undefined}>
      {titleEl && (
        <SectionHeading as={headingTag} $depth={headingDepth}>
          {renderInlineNodes(titleEl.childNodes, `${keyPrefix}-title`)}
        </SectionHeading>
      )}
      {renderBlockNodes(otherChildren, keyPrefix, depth + 1)}
    </section>
  );
};

const renderCaptionTitle = (captionEl: Element | null, keyPrefix: string): React.ReactNode => {
  if (!captionEl) {
    return null;
  }
  const titleEl = directChild(captionEl, 'title');
  if (titleEl) {
    return renderInlineNodes(titleEl.childNodes, `${keyPrefix}-caption-title`);
  }
  return renderInlineNodes(captionEl.childNodes, `${keyPrefix}-caption`);
};

const TableWrap: React.FC<{ el: Element; keyPrefix: string }> = ({ el, keyPrefix }) => {
  const label = directChild(el, 'label');
  const caption = directChild(el, 'caption');
  const table = directChild(el, 'table');
  const foot = directChild(el, 'table-wrap-foot');
  const attrib = foot ? directChild(foot, 'attrib') : null;
  const captionTitle = renderCaptionTitle(caption, keyPrefix);

  return (
    <TableWrapper id={el.getAttribute('id') || undefined}>
      {(label || captionTitle) && (
        <CaptionHeading>
          {label && <strong>{label.textContent}</strong>}
          {label && captionTitle ? ': ' : ''}
          {captionTitle}
        </CaptionHeading>
      )}
      {table && renderHtmlTable(table, keyPrefix)}
      {attrib && <AttribText>{renderInlineNodes(attrib.childNodes, `${keyPrefix}-attrib`)}</AttribText>}
    </TableWrapper>
  );
};

const TABLE_STRUCTURE_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'col', 'colgroup']);

const cellStyle = (el: Element): React.CSSProperties => {
  const style: React.CSSProperties = {};
  const align = el.getAttribute('align');
  const valign = el.getAttribute('valign');
  if (align) style.textAlign = align as React.CSSProperties['textAlign'];
  if (valign) style.verticalAlign = valign as React.CSSProperties['verticalAlign'];
  return style;
};

const renderHtmlTable = (el: Element, keyPrefix: string): React.ReactNode => {
  const walk = (node: Element, key: string): React.ReactNode => {
    const tag = node.tagName.toLowerCase();

    if (tag === 'th' || tag === 'td') {
      const Tag = tag;
      const rowSpan = node.getAttribute('rowspan');
      const colSpan = node.getAttribute('colspan');
      return (
        <Tag
          key={key}
          style={cellStyle(node)}
          rowSpan={rowSpan ? Number(rowSpan) : undefined}
          colSpan={colSpan ? Number(colSpan) : undefined}
        >
          {renderMixedContent(node, key, 6)}
        </Tag>
      );
    }

    if (TABLE_STRUCTURE_TAGS.has(tag)) {
      const Tag = tag as keyof JSX.IntrinsicElements;
      const children = Array.from(node.children).map((child, index) =>
        walk(child, `${key}-${index}`)
      );
      return <Tag key={key}>{children}</Tag>;
    }

    // Fallback: skip unknown table-scoped wrapper tags, recursing into children.
    return (
      <React.Fragment key={key}>
        {Array.from(node.children).map((child, index) => walk(child, `${key}-${index}`))}
      </React.Fragment>
    );
  };

  return walk(el, keyPrefix);
};

const Figure: React.FC<{ el: Element; keyPrefix: string }> = ({ el, keyPrefix }) => {
  const label = directChild(el, 'label');
  const caption = directChild(el, 'caption');
  const graphic = directChild(el, 'graphic');
  const attrib = directChild(el, 'attrib');
  const captionTitle = renderCaptionTitle(caption, keyPrefix);
  const href = graphic ? getGraphicHref(graphic) : null;
  const resolveHref = useFigureHrefResolver();

  return (
    <FigureWrapper id={el.getAttribute('id') || undefined}>
      {(label || captionTitle) && (
        <CaptionHeading>
          {label && <strong>{label.textContent}</strong>}
          {label && captionTitle ? ': ' : ''}
          {captionTitle}
        </CaptionHeading>
      )}
      {href && <img src={resolveHref(href)} alt={label?.textContent || 'Figura'} />}
      {attrib && <AttribText>{renderInlineNodes(attrib.childNodes, `${keyPrefix}-attrib`)}</AttribText>}
    </FigureWrapper>
  );
};
