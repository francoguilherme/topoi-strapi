/**
 * Slate editor behavior for the `section` block: keeps its shape — a mandatory
 * `heading` (the JATS `<title>`) followed by at least one body block — intact across
 * Backspace, Enter and Tab/Shift+Tab, mirroring how block editors like Notion treat a
 * required "title" block that owns a list of children:
 *   - Backspace at the start of the title "peels" the section into plain paragraphs
 *     instead of merging across the title boundary (which used to leave orphaned,
 *     title-less content — see `dissolveSectionAtTitle`). An empty title is omitted so
 *     dissolving an empty section leaves a single empty paragraph, not two.
 *   - Enter at the start of the title inserts a paragraph *above* the section (so a
 *     leading section can gain content before it); Enter elsewhere in the title never
 *     creates a second `heading` — it creates a body paragraph instead.
 *   - Tab/Shift+Tab on a section title promote/demote nesting depth; on body/outer
 *     paragraphs they move content into/out of neighboring sections.
 * A `normalizeNode` safety net also self-heals any invalid shape that slips through via
 * other paths (paste, undo/redo, drag-and-drop), so `advancedBlocks.ts`'s
 * `serializeSection` never has to guess what a section's first child actually is.
 */
import type * as React from 'react';
import { Editor, Element as SlateElement, Node as SlateNode, NodeEntry, Path, Range, Transforms } from 'slate';

import {
  BlockElement,
  createEmptyParagraph,
  HeadingElement,
  ParagraphElement,
  SectionElement,
} from './advancedBlocks';

const isSection = (node: SlateNode): node is SectionElement =>
  SlateElement.isElement(node) && node.type === 'section';

const isHeading = (node: SlateNode): node is HeadingElement =>
  SlateElement.isElement(node) && node.type === 'heading';

const isParagraph = (node: SlateNode): node is ParagraphElement =>
  SlateElement.isElement(node) && node.type === 'paragraph';

/** Nearest ancestor `heading` of the current selection, if any. */
const currentHeadingEntry = (editor: Editor): NodeEntry<HeadingElement> | undefined =>
  Editor.above(editor, { match: isHeading });

/** Nearest ancestor `paragraph` of the current selection, if any. */
const currentParagraphEntry = (editor: Editor): NodeEntry<ParagraphElement> | undefined =>
  Editor.above(editor, { match: isParagraph });

const isCollapsedAtStart = (editor: Editor, path: Path): boolean => {
  const { selection } = editor;
  return !!selection && Range.isCollapsed(selection) && Editor.isStart(editor, selection.anchor, path);
};

/**
 * Recursively rewrites `.depth` on the section at `path` and every nested section
 * inside it, keeping the "one level deeper than parent" invariant intact after a move
 * (dissolve, indent, outdent) — `.depth` drives which heading tag (`h2`/`h3`/`h4`) renders.
 */
export const renumberSectionDepth = (editor: Editor, path: Path, newDepth: number): void => {
  const [node] = Editor.node(editor, path);
  if (!isSection(node)) {
    return;
  }

  Transforms.setNodes(editor, { depth: newDepth }, { at: path });
  Transforms.setNodes(editor, { depth: newDepth }, { at: [...path, 0] });

  node.children.forEach((child, index) => {
    if (index > 0 && SlateElement.isElement(child) && child.type === 'section') {
      renumberSectionDepth(editor, [...path, index], newDepth + 1);
    }
  });
};

/**
 * Blocks Backspace at the start of a section's first body paragraph, so it never merges
 * across the title boundary. Dissolving a section is only ever triggered from the title
 * itself — see `dissolveSectionAtTitle` below.
 */
const isBackspaceBlockedAtFirstSectionParagraph = (editor: Editor): boolean => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) {
    return false;
  }

  const match = Editor.above(editor, {
    match: (n) => SlateElement.isElement(n) && n.type === 'paragraph',
  });
  if (!match) {
    return false;
  }

  const [, paragraphPath] = match;
  if (paragraphPath[paragraphPath.length - 1] !== 1) {
    return false;
  }

  const sectionPath = Path.parent(paragraphPath);
  let section;
  try {
    [section] = Editor.node(editor, sectionPath);
  } catch {
    return false;
  }
  if (!isSection(section)) {
    return false;
  }

  return isCollapsedAtStart(editor, paragraphPath);
};

/**
 * Backspace at the very start of a section's title "peels" the section, Notion-style:
 * the title becomes a normal paragraph (keeping its text) and every body block is lifted
 * out to sit where the section used to be, preserving order and each block's own type
 * (a nested subsection keeps being a section, just one level shallower). A second
 * Backspace then merges that plain paragraph with whatever precedes it, exactly like
 * backspacing out of any other converted block.
 */
const dissolveSectionAtTitle = (editor: Editor): boolean => {
  const headingEntry = currentHeadingEntry(editor);
  if (!headingEntry) {
    return false;
  }
  const [heading, headingPath] = headingEntry;
  if (!isCollapsedAtStart(editor, headingPath)) {
    return false;
  }

  const sectionPath = Path.parent(headingPath);
  let section;
  try {
    [section] = Editor.node(editor, sectionPath);
  } catch {
    return false;
  }
  if (!isSection(section)) {
    return false;
  }

  const bodyBlocks = section.children.slice(1);
  const titleIsEmpty = Editor.isEmpty(editor, heading);
  // Empty titles are omitted so dissolving an empty section leaves one empty body
  // paragraph rather than title-paragraph + body-paragraph (both empty).
  const lifted: BlockElement[] = titleIsEmpty
    ? bodyBlocks
    : [{ type: 'paragraph', children: heading.children }, ...bodyBlocks];
  const parentPath = Path.parent(sectionPath);
  const sectionIndex = sectionPath[sectionPath.length - 1];
  const bodyOffset = titleIsEmpty ? 0 : 1;

  Editor.withoutNormalizing(editor, () => {
    Transforms.removeNodes(editor, { at: sectionPath });
    Transforms.insertNodes(editor, lifted, { at: sectionPath });

    bodyBlocks.forEach((block, index) => {
      if (SlateElement.isElement(block) && block.type === 'section') {
        const newPath = [...parentPath, sectionIndex + bodyOffset + index];
        renumberSectionDepth(editor, newPath, block.depth - 1);
      }
    });
  });

  Transforms.select(editor, Editor.start(editor, sectionPath));
  return true;
};

/**
 * Enter at the very start of a title inserts a normal paragraph *above* the section,
 * so a leading section can gain content before it. Enter elsewhere in the title never
 * splits it into a second `heading` (which `serializeBlock` would silently drop) —
 * the text after the cursor becomes a new body paragraph instead.
 */
const handleHeadingInsertBreak = (editor: Editor): boolean => {
  const headingEntry = currentHeadingEntry(editor);
  if (!headingEntry || !editor.selection) {
    return false;
  }
  const [, headingPath] = headingEntry;
  const sectionPath = Path.parent(headingPath);

  if (isCollapsedAtStart(editor, headingPath)) {
    Transforms.insertNodes(editor, createEmptyParagraph(), { at: sectionPath });
    Transforms.select(editor, Editor.start(editor, sectionPath));
    return true;
  }

  Transforms.splitNodes(editor, { at: editor.selection, match: isHeading, always: true });

  const newParagraphPath = Path.next(headingPath);
  Transforms.setNodes(editor, { type: 'paragraph' }, { at: newParagraphPath });
  Transforms.unsetNodes(editor, 'depth', { at: newParagraphPath });
  Transforms.select(editor, Editor.start(editor, newParagraphPath));

  return true;
};

/**
 * Enter on the last empty body paragraph of a section removes it and creates a new
 * paragraph immediately after the section (exits without splitting). On a non-last
 * empty body paragraph, returns false so the default `insertBreak` creates another
 * paragraph inside the section. If this was the only body block, `normalizeNode`
 * re-adds an empty paragraph to keep the section valid.
 */
const exitSectionOnEmptyBodyParagraphEnter = (editor: Editor): boolean => {
  const paragraphEntry = currentParagraphEntry(editor);
  if (!paragraphEntry) {
    return false;
  }
  const [paragraph, paragraphPath] = paragraphEntry;
  const childIndex = paragraphPath[paragraphPath.length - 1];
  if (childIndex < 1) {
    return false;
  }
  if (!Editor.isEmpty(editor, paragraph)) {
    return false;
  }

  const sectionPath = Path.parent(paragraphPath);
  let section;
  try {
    [section] = Editor.node(editor, sectionPath);
  } catch {
    return false;
  }
  if (!isSection(section)) {
    return false;
  }
  if (childIndex !== section.children.length - 1) {
    return false;
  }

  const afterSectionPath = Path.next(sectionPath);
  Editor.withoutNormalizing(editor, () => {
    Transforms.removeNodes(editor, { at: paragraphPath });
    Transforms.insertNodes(editor, createEmptyParagraph(), { at: afterSectionPath });
  });
  Transforms.select(editor, Editor.start(editor, afterSectionPath));
  return true;
};

/**
 * Delete (forward) must never merge a paragraph into the following `section` — Slate's
 * default merge turns the next section's title/body into a broken duplicate section.
 * Empty paragraph before a section: remove only the paragraph and move the cursor to the
 * section title. Non-empty paragraph at its end before a section: no-op (block the merge).
 */
const deleteForwardBeforeSection = (editor: Editor): boolean => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) {
    return false;
  }

  const paragraphEntry = currentParagraphEntry(editor);
  if (!paragraphEntry) {
    return false;
  }
  const [paragraph, paragraphPath] = paragraphEntry;

  const nextPath = Path.next(paragraphPath);
  if (!Editor.hasPath(editor, nextPath)) {
    return false;
  }
  let nextSibling;
  try {
    [nextSibling] = Editor.node(editor, nextPath);
  } catch {
    return false;
  }
  if (!isSection(nextSibling)) {
    return false;
  }

  if (Editor.isEmpty(editor, paragraph)) {
    Transforms.removeNodes(editor, { at: paragraphPath });
    // After removal, the section occupies `paragraphPath`.
    Transforms.select(editor, Editor.start(editor, paragraphPath));
    return true;
  }

  if (Editor.isEnd(editor, selection.anchor, paragraphPath)) {
    return true;
  }

  return false;
};

/** Nests the section whose title the selection is in as the last child of its previous sibling section. No-op if there's no eligible previous sibling. */
const indentSection = (editor: Editor): boolean => {
  const headingEntry = currentHeadingEntry(editor);
  if (!headingEntry) {
    return false;
  }
  const [, headingPath] = headingEntry;
  const sectionPath = Path.parent(headingPath);
  const index = sectionPath[sectionPath.length - 1];
  if (index === 0) {
    return false;
  }

  const prevSiblingPath = Path.previous(sectionPath);
  let prevSibling;
  try {
    [prevSibling] = Editor.node(editor, prevSiblingPath);
  } catch {
    return false;
  }
  if (!isSection(prevSibling)) {
    return false;
  }

  const newPath = [...prevSiblingPath, prevSibling.children.length];
  const newDepth = prevSibling.depth + 1;

  Editor.withoutNormalizing(editor, () => {
    Transforms.moveNodes(editor, { at: sectionPath, to: newPath });
    renumberSectionDepth(editor, newPath, newDepth);
  });
  return true;
};

/** Promotes the section whose title the selection is in to be a sibling of its parent section. No-op if the section is already at the top level. */
const outdentSection = (editor: Editor): boolean => {
  const headingEntry = currentHeadingEntry(editor);
  if (!headingEntry) {
    return false;
  }
  const [, headingPath] = headingEntry;
  const sectionPath = Path.parent(headingPath);
  const parentPath = Path.parent(sectionPath);
  if (parentPath.length === 0) {
    return false;
  }

  let parentNode;
  try {
    [parentNode] = Editor.node(editor, parentPath);
  } catch {
    return false;
  }
  if (!isSection(parentNode)) {
    return false;
  }

  const grandParentPath = Path.parent(parentPath);
  const newIndex = parentPath[parentPath.length - 1] + 1;
  const newPath = [...grandParentPath, newIndex];
  const newDepth = parentNode.depth;

  Editor.withoutNormalizing(editor, () => {
    Transforms.moveNodes(editor, { at: sectionPath, to: newPath });
    renumberSectionDepth(editor, newPath, newDepth);
  });
  return true;
};

/**
 * Shift+Tab on a body paragraph inside a section: move that paragraph and every
 * following sibling out of the section, placing them immediately after it ("from here
 * on, leave the section"). `normalizeNode` re-adds an empty body paragraph if only the
 * heading remains.
 */
const liftParagraphAndFollowingFromSection = (editor: Editor): boolean => {
  const paragraphEntry = currentParagraphEntry(editor);
  if (!paragraphEntry) {
    return false;
  }
  const [, paragraphPath] = paragraphEntry;
  const childIndex = paragraphPath[paragraphPath.length - 1];
  if (childIndex < 1) {
    return false;
  }

  const sectionPath = Path.parent(paragraphPath);
  let section;
  try {
    [section] = Editor.node(editor, sectionPath);
  } catch {
    return false;
  }
  if (!isSection(section)) {
    return false;
  }

  const lastBodyIndex = section.children.length - 1;
  Editor.withoutNormalizing(editor, () => {
    for (let index = lastBodyIndex; index >= childIndex; index -= 1) {
      Transforms.moveNodes(editor, {
        at: [...sectionPath, index],
        to: Path.next(sectionPath),
      });
    }
  });
  return true;
};

/** Tab on a paragraph outside a section: append it to the previous sibling section, if any. */
const moveParagraphIntoPreviousSection = (editor: Editor): boolean => {
  const paragraphEntry = currentParagraphEntry(editor);
  if (!paragraphEntry) {
    return false;
  }
  const [, paragraphPath] = paragraphEntry;
  const parentPath = Path.parent(paragraphPath);
  let parent;
  try {
    [parent] = Editor.node(editor, parentPath);
  } catch {
    return false;
  }
  if (isSection(parent)) {
    return false;
  }
  if (!Path.hasPrevious(paragraphPath)) {
    return false;
  }

  const prevSiblingPath = Path.previous(paragraphPath);
  let prevSibling;
  try {
    [prevSibling] = Editor.node(editor, prevSiblingPath);
  } catch {
    return false;
  }
  if (!isSection(prevSibling)) {
    return false;
  }

  const destination = [...prevSiblingPath, prevSibling.children.length];
  Transforms.moveNodes(editor, { at: paragraphPath, to: destination });
  return true;
};

/**
 * Tab/Shift+Tab for sections and neighboring paragraphs:
 *   - title + Tab/Shift+Tab → indent/outdent the whole section
 *   - body `<p>` + Shift+Tab → lift that paragraph and following siblings out of the section
 *   - outer `<p>` + Tab → append into the previous sibling section (if any)
 * Returns whether the key was handled (and `preventDefault` was called).
 */
export const handleSectionTabKey = (editor: Editor, event: React.KeyboardEvent): boolean => {
  if (event.key !== 'Tab') {
    return false;
  }

  if (currentHeadingEntry(editor)) {
    // Consume Tab in the title so focus does not leave the editor, even when
    // indent/outdent is a no-op (first section / already at root).
    event.preventDefault();
    if (event.shiftKey) {
      outdentSection(editor);
    } else {
      indentSection(editor);
    }
    return true;
  }

  if (event.shiftKey) {
    if (liftParagraphAndFollowingFromSection(editor)) {
      event.preventDefault();
      return true;
    }
    return false;
  }

  if (moveParagraphIntoPreviousSection(editor)) {
    event.preventDefault();
    return true;
  }

  return false;
};

/**
 * Rule A: a section's first child must be a `heading` (auto-inserts an empty one if
 * missing). Rule B: a section may not contain more than one direct `heading` (extras are
 * demoted to `paragraph`, preserving their text) — the safety-net equivalent of the Enter
 * fix above, for any path that bypasses it (paste, undo/redo, drag-and-drop). Rule C: a
 * section must keep at least one body block after the title (auto-appends an empty
 * paragraph) — keeps `<sec><title/></sec>` from ever being a reachable state.
 */
const normalizeSection = (editor: Editor, entry: NodeEntry): boolean => {
  const [node, path] = entry;
  if (!isSection(node)) {
    return false;
  }

  const [firstChild] = node.children;
  if (!firstChild || !isHeading(firstChild)) {
    Transforms.insertNodes(
      editor,
      { type: 'heading', depth: node.depth, children: [{ text: '' }] },
      { at: [...path, 0] }
    );
    return true;
  }

  for (let index = node.children.length - 1; index > 0; index -= 1) {
    const child = node.children[index];
    if (isHeading(child)) {
      const childPath = [...path, index];
      Transforms.setNodes(editor, { type: 'paragraph' }, { at: childPath });
      Transforms.unsetNodes(editor, 'depth', { at: childPath });
      return true;
    }
  }

  if (node.children.length === 1) {
    Transforms.insertNodes(editor, createEmptyParagraph(), { at: [...path, 1] });
    return true;
  }

  return false;
};

/** Wires the Backspace/Delete/Enter/normalize behavior above into a Slate editor. */
export const withSections = <T extends Editor>(editor: T): T => {
  const { deleteBackward, deleteForward, insertBreak, normalizeNode } = editor;

  editor.deleteBackward = (unit) => {
    if (dissolveSectionAtTitle(editor)) {
      return;
    }
    if (isBackspaceBlockedAtFirstSectionParagraph(editor)) {
      return;
    }
    deleteBackward(unit);
  };

  editor.deleteForward = (unit) => {
    if (deleteForwardBeforeSection(editor)) {
      return;
    }
    deleteForward(unit);
  };

  editor.insertBreak = () => {
    if (handleHeadingInsertBreak(editor)) {
      return;
    }
    if (exitSectionOnEmptyBodyParagraphEnter(editor)) {
      return;
    }
    insertBreak();
  };

  editor.normalizeNode = (entry) => {
    if (normalizeSection(editor, entry)) {
      return;
    }
    normalizeNode(entry);
  };

  return editor;
};
