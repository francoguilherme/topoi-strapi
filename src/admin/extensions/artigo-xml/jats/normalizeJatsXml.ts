import { parseJatsXml } from './ArticleRenderer';
import { extractXmlHeader } from './editor/domMutations';

/** Tags whose literal whitespace must be kept (and all descendants). */
const PRESERVE_WS_TAGS = new Set(['preformat', 'code', 'verse-line']);

/**
 * JATS elements whose **element children** are placed on separate indented lines.
 * Leaf block elements such as `<p>` are not listed here — they are serialized in
 * full (texto corrido) on a single line via `XMLSerializer`.
 */
const BLOCK_CONTAINER_TAGS = new Set([
  'article',
  'front',
  'back',
  'body',
  'sec',
  'abstract',
  'trans-abstract',
  'journal-meta',
  'article-meta',
  'article-categories',
  'subj-group',
  'title-group',
  'trans-title-group',
  'contrib-group',
  'aff',
  'author-notes',
  'pub-date',
  'history',
  'date',
  'permissions',
  'license',
  'kwd-group',
  'funding-group',
  'award-group',
  'table-wrap',
  'fig',
  'fig-group',
  'list',
  'list-item',
  'disp-quote',
  'boxed-text',
  'verse-group',
  'fn-group',
  'ref-list',
  'publisher',
  'journal-title-group',
  'alternatives',
  'caption',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'supplementary-material',
  'media',
  'ack',
  'notes',
  'addr-line',
  'custom-meta-wrap',
]);

const serializer = new XMLSerializer();

const trimBoundaryWhitespace = (el: Element): void => {
  const first = el.firstChild;
  if (first?.nodeType === Node.TEXT_NODE && first.textContent) {
    first.textContent = first.textContent.replace(/^\s+/, '');
    if (!first.textContent) {
      el.removeChild(first);
    }
  }

  const last = el.lastChild;
  if (last?.nodeType === Node.TEXT_NODE && last !== first && last.textContent) {
    last.textContent = last.textContent.replace(/\s+$/, '');
    if (!last.textContent) {
      el.removeChild(last);
    }
  }
};

const normalizeWhitespace = (node: Node, preserveWhitespace: boolean): void => {
  if (node.nodeType === Node.TEXT_NODE) {
    if (preserveWhitespace || !node.textContent) {
      return;
    }

    const collapsed = node.textContent.replace(/\s+/g, ' ');
    if (!collapsed.trim()) {
      node.parentNode?.removeChild(node);
      return;
    }

    node.textContent = collapsed;
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const el = node as Element;
  const preserve = preserveWhitespace || PRESERVE_WS_TAGS.has(el.tagName.toLowerCase());

  Array.from(el.childNodes).forEach((child) => normalizeWhitespace(child, preserve));

  if (!preserve) {
    trimBoundaryWhitespace(el);
  }
};

/** Wraps `<xref ref-type="fn">` content in `<sup>` when not already present. */
const wrapFnXrefsWithSup = (doc: Document): void => {
  Array.from(doc.getElementsByTagName('xref')).forEach((xref) => {
    if (xref.getAttribute('ref-type') !== 'fn') {
      return;
    }

    const hasDirectSup = Array.from(xref.childNodes).some(
      (node) => node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'sup'
    );
    if (hasDirectSup) {
      return;
    }

    const sup = doc.createElement('sup');
    while (xref.firstChild) {
      sup.appendChild(xref.firstChild);
    }
    xref.appendChild(sup);
  });
};

const usesBlockContainerLayout = (el: Element): boolean =>
  BLOCK_CONTAINER_TAGS.has(el.tagName.toLowerCase());

const extractOpenTag = (serialized: string, tagName: string): string => {
  if (serialized.endsWith('/>')) {
    return serialized;
  }

  const closeTag = `</${tagName}>`;
  const closeIndex = serialized.lastIndexOf(closeTag);
  if (closeIndex === -1) {
    return serialized;
  }

  return serialized.slice(0, closeIndex);
};

const prettyPrintElement = (el: Element, indent: number): string => {
  const pad = '  '.repeat(indent);
  const serialized = serializer.serializeToString(el);

  if (!usesBlockContainerLayout(el)) {
    return `${pad}${serialized}`;
  }

  const elementChildren = Array.from(el.children);
  if (elementChildren.length === 0) {
    return `${pad}${serialized}`;
  }

  if (serialized.endsWith('/>')) {
    return `${pad}${serialized}`;
  }

  const openPart = extractOpenTag(serialized, el.tagName);
  const openTagMatch = openPart.match(/^<[^>]+>/);
  const openTag = openTagMatch ? openTagMatch[0] : `<${el.tagName}>`;
  const closeTag = `</${el.tagName}>`;
  const childLines = elementChildren.map((child) => prettyPrintElement(child, indent + 1));

  return `${pad}${openTag}\n${childLines.join('\n')}\n${pad}${closeTag}`;
};

/**
 * Normalizes SciELO/SPS-style JATS XML: collapses incidental line breaks inside
 * inline content and re-serializes with block-level indentation.
 */
export const normalizeJatsXml = (raw: string): string => {
  const header = extractXmlHeader(raw);
  const doc = parseJatsXml(raw);

  wrapFnXrefsWithSup(doc);
  normalizeWhitespace(doc.documentElement, false);

  const body = prettyPrintElement(doc.documentElement, 0);
  const trimmedHeader = header.replace(/\s+$/, '');

  return trimmedHeader ? `${trimmedHeader}\n${body}\n` : `${body}\n`;
};

/** Reads a `File`, normalizes its JATS XML, and returns a new `File`. */
export const normalizeJatsXmlFile = async (file: File): Promise<File> => {
  const normalized = normalizeJatsXml(await file.text());
  return new File([normalized], file.name, { type: file.type || 'application/xml' });
};
