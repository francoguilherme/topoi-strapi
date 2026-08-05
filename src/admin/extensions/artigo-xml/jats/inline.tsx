import * as React from 'react';

/**
 * Renders the inline (character-level) content of a JATS element: plain text
 * mixed with formatting tags such as <italic>, <bold>, <sup>/<sub>, cross
 * references (<xref>) and external links (<ext-link>).
 *
 * Unknown tags are "unwrapped" (their children are still rendered) so that
 * content is never silently dropped, even for elements this renderer doesn't
 * explicitly know about.
 */
export const renderInlineNodes = (
  nodes: ArrayLike<ChildNode>,
  keyPrefix: string
): React.ReactNode[] => {
  const result: React.ReactNode[] = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const key = `${keyPrefix}-${i}`;

    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        result.push(node.textContent);
      }
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    result.push(renderInlineElement(node as Element, key));
  }

  return result;
};

const renderInlineChildren = (el: Element, keyPrefix: string) =>
  renderInlineNodes(el.childNodes, keyPrefix);

const renderInlineElement = (el: Element, key: string): React.ReactNode => {
  const tag = el.tagName.toLowerCase();
  const children = () => renderInlineChildren(el, key);

  switch (tag) {
    case 'italic':
    case 'i':
      return <em key={key}>{children()}</em>;

    case 'bold':
    case 'b':
      return <strong key={key}>{children()}</strong>;

    case 'bold-italic':
      return (
        <strong key={key}>
          <em>{children()}</em>
        </strong>
      );

    case 'underline':
      return (
        <span key={key} style={{ textDecoration: 'underline' }}>
          {children()}
        </span>
      );

    case 'strike':
    case 'sc':
      return tag === 'sc' ? (
        <span key={key} style={{ fontVariant: 'small-caps' }}>
          {children()}
        </span>
      ) : (
        <span key={key} style={{ textDecoration: 'line-through' }}>
          {children()}
        </span>
      );

    case 'sup':
      return <sup key={key}>{children()}</sup>;

    case 'sub':
      return <sub key={key}>{children()}</sub>;

    case 'monospace':
      return <code key={key}>{children()}</code>;

    case 'break':
      return <br key={key} />;

    case 'xref': {
      const rid = el.getAttribute('rid');
      if (!rid) {
        return <React.Fragment key={key}>{children()}</React.Fragment>;
      }
      return (
        <a key={key} href={`#${rid}`} className="jats-xref">
          {children()}
        </a>
      );
    }

    case 'ext-link':
    case 'uri': {
      const href =
        el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
        el.getAttribute('xlink:href') ||
        el.getAttribute('href');
      if (!href) {
        return <React.Fragment key={key}>{children()}</React.Fragment>;
      }
      return (
        <a key={key} href={href} target="_blank" rel="noreferrer">
          {children()}
        </a>
      );
    }

    case 'email': {
      const address = el.textContent ?? '';
      return (
        <a key={key} href={`mailto:${address}`}>
          {children()}
        </a>
      );
    }

    default:
      // Unknown wrapper tag (named-content, styled-content, etc.): keep the
      // content flowing by rendering its children directly.
      return <React.Fragment key={key}>{children()}</React.Fragment>;
  }
};
