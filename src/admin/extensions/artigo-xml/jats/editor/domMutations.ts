/**
 * Low-level helpers for editing a parsed JATS `Document` in place (instead of
 * rebuilding an XML string from a separate data model) and serializing it back.
 *
 * The structured field editors (`MetadataFields`, `BodyFields`, `NotesFields`,
 * `ReferencesFields`) all work directly against a shared, live `Document` produced
 * by `parseJatsXml`: they read values from DOM elements and mutate them with the
 * primitives below, then call `serializeArticle` to turn the result back into a
 * string. Anything the forms don't have a field for (e.g. `element-citation`,
 * `permissions`, uncommon attributes) simply isn't touched, so it survives the
 * round trip untouched.
 */

import type { XrefRefType } from './inlineModel';

export const directChildren = (el: Element | null | undefined, tagName: string): Element[] =>
  el ? Array.from(el.children).filter((c) => c.tagName.toLowerCase() === tagName.toLowerCase()) : [];

export const directChild = (el: Element | null | undefined, tagName: string): Element | null =>
  directChildren(el, tagName)[0] ?? null;

/** Creates `tagName` under `parent` if it doesn't already exist as a direct child. */
export const ensureChild = (
  parent: Element,
  tagName: string,
  options?: { before?: Element | null }
): Element => {
  const existing = directChild(parent, tagName);
  if (existing) {
    return existing;
  }

  const doc = parent.ownerDocument;
  const created = doc.createElement(tagName);

  if (options?.before) {
    parent.insertBefore(created, options.before);
  } else {
    parent.appendChild(created);
  }

  return created;
};

/** Removes `el` from its parent, if it has one. No-op for `null`/detached elements. */
export const removeElement = (el: Element | null | undefined): void => {
  el?.parentElement?.removeChild(el);
};

/** Replaces all children of `el` with `nodes`. */
export const replaceChildren = (el: Element, nodes: Node[]): void => {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
  nodes.forEach((node) => el.appendChild(node));
};

/** Sets `el`'s content to a single plain-text node (or empties it for blank text). */
export const setPlainText = (el: Element, text: string): void => {
  const trimmed = text;
  replaceChildren(el, trimmed ? [el.ownerDocument.createTextNode(trimmed)] : []);
};

/** Sets or removes an attribute depending on whether `value` is a non-empty string. */
export const setAttr = (el: Element, name: string, value: string | null | undefined): void => {
  if (value) {
    el.setAttribute(name, value);
  } else {
    el.removeAttribute(name);
  }
};

/**
 * Moves `el` one position up/down among its siblings (used for reordering
 * sections/blocks/authors/affiliations/etc. from the structured editor).
 */
export const moveElement = (el: Element, direction: 'up' | 'down'): void => {
  const parent = el.parentElement;
  if (!parent) {
    return;
  }

  if (direction === 'up') {
    const prev = el.previousElementSibling;
    if (prev) {
      parent.insertBefore(el, prev);
    }
  } else {
    const next = el.nextElementSibling;
    if (next) {
      parent.insertBefore(next, el);
    }
  }
};

/**
 * Finds the lowest-numbered unused id of the form `${prefix}${n}` (n starting at 1),
 * scanning every `id` attribute already present in the document. Mirrors the existing
 * `fn1`/`fn2`/... and `B1`/`B2`/... conventions used by footnotes and references.
 */
export const nextFreeId = (doc: Document, prefix: string): string => {
  const used = new Set<string>();
  doc.querySelectorAll('[id]').forEach((el) => {
    const id = el.getAttribute('id');
    if (id) {
      used.add(id);
    }
  });

  let n = 1;
  while (used.has(`${prefix}${n}`)) {
    n += 1;
  }
  return `${prefix}${n}`;
};

/** Counts `<xref rid="id">` occurrences anywhere in the document. */
export const countXrefsToId = (doc: Document, id: string): number =>
  Array.from(doc.getElementsByTagName('xref')).filter((el) => el.getAttribute('rid') === id).length;

export interface XrefTarget {
  id: string;
  label: string;
  refType: XrefRefType;
}

const mediaLabel = (kind: 'Figura' | 'Tabela', id: string, labelEl: Element | null): string => {
  const label = labelEl?.textContent?.trim();
  return label || `${kind} ${id}`;
};

const collectFigTargets = (root: Element): XrefTarget[] =>
  Array.from(root.getElementsByTagName('fig'))
    .map((fig) => {
      const id = fig.getAttribute('id') || '';
      return {
        id,
        refType: 'fig' as const,
        label: mediaLabel('Figura', id, directChild(fig, 'label')),
      };
    })
    .filter((target) => target.id);

const collectTableTargets = (root: Element): XrefTarget[] =>
  Array.from(root.getElementsByTagName('table-wrap'))
    .map((wrap) => {
      const id = wrap.getAttribute('id') || '';
      return {
        id,
        refType: 'table' as const,
        label: mediaLabel('Tabela', id, directChild(wrap, 'label')),
      };
    })
    .filter((target) => target.id);

/**
 * Lists every footnote and reference that can be linked to via `<xref rid="...">`, for the
 * cross-reference picker in `InlineRichEditor`. Labels are short, human-readable summaries
 * (the footnote's number, or a snippet of the reference's citation text) meant to help pick
 * the right target — the `id` is what actually gets written into the `rid` attribute.
 */
export const listXrefTargets = (doc: Document): XrefTarget[] => {
  const notes: XrefTarget[] = Array.from(doc.getElementsByTagName('fn'))
    .map((fn) => {
      const id = fn.getAttribute('id') || '';
      const label = directChild(fn, 'label')?.textContent?.trim();
      return { id, refType: 'fn' as const, label: `Nota ${label || id}` };
    })
    .filter((target) => target.id);

  const refs: XrefTarget[] = Array.from(doc.getElementsByTagName('ref'))
    .map((ref) => {
      const id = ref.getAttribute('id') || '';
      const citation = directChild(ref, 'mixed-citation')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const snippet = citation.length > 60 ? `${citation.slice(0, 60)}…` : citation;
      return {
        id,
        refType: 'bibr' as const,
        label: snippet ? `Ref. ${id} — ${snippet}` : `Ref. ${id}`,
      };
    })
    .filter((target) => target.id);

  return [...notes, ...refs];
};

/** Lists figure and table targets from the article `<body>` for cross-reference pickers. */
export const listMediaXrefTargets = (doc: Document): XrefTarget[] => {
  const body = doc.getElementsByTagName('body')[0];
  if (!body) {
    return [];
  }
  return [...collectFigTargets(body), ...collectTableTargets(body)];
};

/**
 * Renames every `<xref rid="oldId">` to point at `newId` (used when a footnote/reference
 * id has to change, e.g. to keep the `fnN`/`BN` sequence contiguous after a removal).
 */
export const renameXrefTargets = (doc: Document, oldId: string, newId: string): void => {
  Array.from(doc.getElementsByTagName('xref')).forEach((el) => {
    if (el.getAttribute('rid') === oldId) {
      el.setAttribute('rid', newId);
    }
  });
};

/**
 * Captures everything in the original raw XML text before the root element's opening
 * tag (XML declaration, comments, DOCTYPE...), since `XMLSerializer` doesn't reliably
 * reproduce it. Re-prepended by `serializeArticle` when saving.
 */
export const extractXmlHeader = (rawXml: string): string => {
  const match = rawXml.match(/<[A-Za-z]/);
  if (!match || match.index === undefined) {
    return '';
  }
  return rawXml.slice(0, match.index);
};

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** Reads an element's `xml:lang` attribute (checked both the plain and namespaced way). */
export const getLang = (el: Element): string =>
  el.getAttribute('xml:lang') || el.getAttributeNS(XML_NS, 'lang') || '';

/** Sets or clears an element's `xml:lang` attribute. */
export const setLang = (el: Element, lang: string): void => {
  if (lang) {
    el.setAttributeNS(XML_NS, 'xml:lang', lang);
  } else {
    el.removeAttribute('xml:lang');
    el.removeAttributeNS(XML_NS, 'lang');
  }
};

const elementKeys = new WeakMap<Element, number>();
let nextElementKey = 1;

/**
 * Returns a React key that stays stable for a given live DOM `Element` across
 * re-renders and reordering (`moveElement`), but changes once that element is removed
 * and a new one takes its place. Used to key list items and to `key` an
 * `InlineRichEditor` so it only remounts (and resets its internal Slate state) when the
 * JATS element it's editing actually changes, not on every unrelated render.
 */
export const getElementKey = (el: Element): string => {
  let key = elementKeys.get(el);
  if (key === undefined) {
    key = nextElementKey;
    nextElementKey += 1;
    elementKeys.set(el, key);
  }
  return `el-${key}`;
};

/** Serializes `doc` back into an XML string, re-attaching the original header. */
export const serializeArticle = (doc: Document, header: string): string => {
  const serialized = new XMLSerializer().serializeToString(doc.documentElement);
  const trimmedHeader = header.replace(/\s+$/, '');
  return trimmedHeader ? `${trimmedHeader}\n${serialized}\n` : `${serialized}\n`;
};
