/**
 * Slate editor behavior for the `verse-group` block:
 *   - Backspace at the start of the first verse line lifts that line out of the
 *     group (and removes the group entirely when it was the only line).
 *   - Enter on the last empty verse line exits the group: that line is removed
 *     and a normal paragraph is created immediately after the group.
 */
import { Editor, Element as SlateElement, Node as SlateNode, Path, Range, Transforms } from 'slate';

import {
  createEmptyParagraph,
  ParagraphElement,
  VerseGroupElement,
  VerseLineElement,
} from './advancedBlocks';

const isVerseGroup = (node: SlateNode): node is VerseGroupElement =>
  SlateElement.isElement(node) && node.type === 'verse-group';

const isVerseLine = (node: SlateNode): node is VerseLineElement =>
  SlateElement.isElement(node) && node.type === 'verse-line';

const currentVerseLineEntry = (editor: Editor) => Editor.above(editor, { match: isVerseLine });

const isCollapsedAtStart = (editor: Editor, path: Path): boolean => {
  const { selection } = editor;
  return !!selection && Range.isCollapsed(selection) && Editor.isStart(editor, selection.anchor, path);
};

/** Index of the first `verse-line` child in a group, or -1 if none. */
const firstVerseLineIndex = (group: VerseGroupElement): number =>
  group.children.findIndex(isVerseLine);

/** Index of the last `verse-line` child in a group, or -1 if none. */
const lastVerseLineIndex = (group: VerseGroupElement): number => {
  for (let index = group.children.length - 1; index >= 0; index -= 1) {
    if (isVerseLine(group.children[index])) {
      return index;
    }
  }
  return -1;
};

/**
 * Backspace at the start of the first verse line pulls that line out of the group
 * (placed immediately before it). If it was the only line, the group is removed
 * and replaced by a normal paragraph.
 */
const liftFirstVerseLineOutOfGroup = (editor: Editor): boolean => {
  const lineEntry = currentVerseLineEntry(editor);
  if (!lineEntry) {
    return false;
  }
  const [line, linePath] = lineEntry;
  if (!isCollapsedAtStart(editor, linePath)) {
    return false;
  }

  const groupPath = Path.parent(linePath);
  let group;
  try {
    [group] = Editor.node(editor, groupPath);
  } catch {
    return false;
  }
  if (!isVerseGroup(group)) {
    return false;
  }

  const childIndex = linePath[linePath.length - 1];
  if (childIndex !== firstVerseLineIndex(group)) {
    return false;
  }

  const lineCount = group.children.filter(isVerseLine).length;
  if (lineCount <= 1) {
    const outer: ParagraphElement = { type: 'paragraph', children: line.children };
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: groupPath });
      Transforms.insertNodes(editor, outer, { at: groupPath });
    });
    Transforms.select(editor, Editor.start(editor, groupPath));
    return true;
  }

  Transforms.moveNodes(editor, { at: linePath, to: groupPath });
  Transforms.select(editor, Editor.start(editor, groupPath));
  return true;
};

/**
 * Enter on the last empty verse line removes it and creates a normal paragraph
 * right after the group. If that was the group's only line, the empty group
 * itself is removed too.
 */
const exitVerseGroupOnEmptyLastLineEnter = (editor: Editor): boolean => {
  const lineEntry = currentVerseLineEntry(editor);
  if (!lineEntry) {
    return false;
  }
  const [line, linePath] = lineEntry;
  if (!Editor.isEmpty(editor, line)) {
    return false;
  }

  const groupPath = Path.parent(linePath);
  let group;
  try {
    [group] = Editor.node(editor, groupPath);
  } catch {
    return false;
  }
  if (!isVerseGroup(group)) {
    return false;
  }

  const childIndex = linePath[linePath.length - 1];
  if (childIndex !== lastVerseLineIndex(group)) {
    return false;
  }

  const lineCount = group.children.filter(isVerseLine).length;
  if (lineCount <= 1) {
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: groupPath });
      Transforms.insertNodes(editor, createEmptyParagraph(), { at: groupPath });
    });
    Transforms.select(editor, Editor.start(editor, groupPath));
    return true;
  }

  const afterGroupPath = Path.next(groupPath);
  Editor.withoutNormalizing(editor, () => {
    Transforms.removeNodes(editor, { at: linePath });
    Transforms.insertNodes(editor, createEmptyParagraph(), { at: afterGroupPath });
  });
  Transforms.select(editor, Editor.start(editor, afterGroupPath));
  return true;
};

/** True when `path` is a direct child of a `verse-group`. */
export const isInsideVerseGroup = (editor: Editor, path: Path): boolean => {
  if (path.length === 0) {
    return false;
  }
  try {
    const [parent] = Editor.node(editor, Path.parent(path));
    return SlateElement.isElement(parent) && parent.type === 'verse-group';
  } catch {
    return false;
  }
};

/** Wires verse-group Backspace/Enter behavior into a Slate editor. */
export const withVerses = <T extends Editor>(editor: T): T => {
  const { deleteBackward, insertBreak } = editor;

  editor.deleteBackward = (unit) => {
    if (liftFirstVerseLineOutOfGroup(editor)) {
      return;
    }
    deleteBackward(unit);
  };

  editor.insertBreak = () => {
    if (exitVerseGroupOnEmptyLastLineEnter(editor)) {
      return;
    }
    insertBreak();
  };

  return editor;
};
