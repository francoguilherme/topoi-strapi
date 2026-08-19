/**
 * Slate editor behavior for `list` blocks:
 *   - Backspace at the start of the first item's paragraph lifts that paragraph out of the
 *     list (and removes the list entirely when it was the only item).
 *   - Enter on the last empty item exits the list: that item is removed and a normal
 *     paragraph is created immediately after the list.
 *   - Enter otherwise splits the current item or appends a new empty item below.
 */
import { Editor, Element as SlateElement, Node, Path, Range, Transforms } from 'slate';

import {
  createEmptyParagraph,
  ListElement,
  ListItemElement,
  ParagraphElement,
} from './advancedBlocks';

const isList = (node: Node): node is ListElement =>
  SlateElement.isElement(node) && node.type === 'list';

const isListItem = (node: Node): node is ListItemElement =>
  SlateElement.isElement(node) && node.type === 'list-item';

const isParagraph = (node: Node): node is ParagraphElement =>
  SlateElement.isElement(node) && node.type === 'paragraph';

const currentListItemParagraphEntry = (editor: Editor) => {
  const paragraphEntry = Editor.above(editor, { match: isParagraph });
  if (!paragraphEntry) {
    return null;
  }
  const [, paragraphPath] = paragraphEntry;
  try {
    const [parent] = Editor.node(editor, Path.parent(paragraphPath));
    if (!isListItem(parent)) {
      return null;
    }
  } catch {
    return null;
  }
  return paragraphEntry;
};

const isCollapsedAtStart = (editor: Editor, path: Path): boolean => {
  const { selection } = editor;
  return !!selection && Range.isCollapsed(selection) && Editor.isStart(editor, selection.anchor, path);
};

/** Index of the last `list-item` child in a list, or -1 if none. */
const lastListItemIndex = (list: ListElement): number => list.children.length - 1;

/**
 * Backspace at the start of the first list item's paragraph pulls that paragraph out of
 * the list (placed immediately before it). If it was the only item, the list is removed
 * and replaced by a normal paragraph.
 */
const liftFirstItemOutOfList = (editor: Editor): boolean => {
  const paragraphEntry = currentListItemParagraphEntry(editor);
  if (!paragraphEntry) {
    return false;
  }
  const [paragraph, paragraphPath] = paragraphEntry;
  if (!isCollapsedAtStart(editor, paragraphPath)) {
    return false;
  }

  const listItemPath = Path.parent(paragraphPath);
  const listPath = Path.parent(listItemPath);
  let list;
  try {
    [list] = Editor.node(editor, listPath);
  } catch {
    return false;
  }
  if (!isList(list)) {
    return false;
  }

  const itemIndex = listItemPath[listItemPath.length - 1];
  if (itemIndex !== 0) {
    return false;
  }

  const itemCount = list.children.length;
  if (itemCount <= 1) {
    const outer: ParagraphElement = { type: 'paragraph', children: paragraph.children };
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: listPath });
      Transforms.insertNodes(editor, outer, { at: listPath });
    });
    Transforms.select(editor, Editor.start(editor, listPath));
    return true;
  }

  Transforms.moveNodes(editor, { at: paragraphPath, to: listPath });
  Transforms.select(editor, Editor.start(editor, listPath));
  return true;
};

/**
 * Enter on the last empty list item removes it and creates a normal paragraph right
 * after the list. If that was the list's only item, the empty list itself is removed too.
 */
const exitListOnEmptyLastItemEnter = (editor: Editor): boolean => {
  const paragraphEntry = currentListItemParagraphEntry(editor);
  if (!paragraphEntry) {
    return false;
  }
  const [paragraph, paragraphPath] = paragraphEntry;
  if (!Editor.isEmpty(editor, paragraph)) {
    return false;
  }

  const listItemPath = Path.parent(paragraphPath);
  const listPath = Path.parent(listItemPath);
  let list;
  try {
    [list] = Editor.node(editor, listPath);
  } catch {
    return false;
  }
  if (!isList(list)) {
    return false;
  }

  const itemIndex = listItemPath[listItemPath.length - 1];
  if (itemIndex !== lastListItemIndex(list)) {
    return false;
  }

  const itemCount = list.children.length;
  if (itemCount <= 1) {
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: listPath });
      Transforms.insertNodes(editor, createEmptyParagraph(), { at: listPath });
    });
    Transforms.select(editor, Editor.start(editor, listPath));
    return true;
  }

  const afterListPath = Path.next(listPath);
  Editor.withoutNormalizing(editor, () => {
    Transforms.removeNodes(editor, { at: listItemPath });
    Transforms.insertNodes(editor, createEmptyParagraph(), { at: afterListPath });
  });
  Transforms.select(editor, Editor.start(editor, afterListPath));
  return true;
};

/** Enter inside a list item: append or split into a new item below the current one. */
const insertListItemOnEnter = (editor: Editor): boolean => {
  const paragraphEntry = currentListItemParagraphEntry(editor);
  if (!paragraphEntry) {
    return false;
  }
  const [, paragraphPath] = paragraphEntry;

  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) {
    return false;
  }

  const listItemPath = Path.parent(paragraphPath);
  const newItemPath = Path.next(listItemPath);

  if (Editor.isEnd(editor, selection.anchor, paragraphPath)) {
    Transforms.insertNodes(
      editor,
      { type: 'list-item', children: [createEmptyParagraph()] },
      { at: newItemPath }
    );
    Transforms.select(editor, Editor.start(editor, newItemPath));
    return true;
  }

  Transforms.splitNodes(editor, { always: true });

  try {
    const [listItem] = Editor.node(editor, listItemPath);
    if (isListItem(listItem) && listItem.children.length > 1) {
      const secondParagraph = listItem.children[1];
      Editor.withoutNormalizing(editor, () => {
        Transforms.removeNodes(editor, { at: [...listItemPath, 1] });
        Transforms.insertNodes(
          editor,
          { type: 'list-item', children: [secondParagraph as ParagraphElement] },
          { at: newItemPath }
        );
      });
      Transforms.select(editor, Editor.start(editor, newItemPath));
    }
  } catch {
    // Node may have moved during split — fall through.
  }

  return true;
};

/** True when `path` is a direct child of a `list-item`. */
export const isInsideListItem = (editor: Editor, path: Path): boolean => {
  if (path.length === 0) {
    return false;
  }
  try {
    const [parent] = Editor.node(editor, Path.parent(path));
    return SlateElement.isElement(parent) && parent.type === 'list-item';
  } catch {
    return false;
  }
};

/** Wires list Backspace/Enter behavior and structural normalization into a Slate editor. */
export const withLists = <T extends Editor>(editor: T): T => {
  const { deleteBackward, insertBreak, normalizeNode } = editor;

  editor.deleteBackward = (unit) => {
    if (liftFirstItemOutOfList(editor)) {
      return;
    }
    deleteBackward(unit);
  };

  editor.insertBreak = () => {
    if (exitListOnEmptyLastItemEnter(editor)) {
      return;
    }
    if (insertListItemOnEnter(editor)) {
      return;
    }
    insertBreak();
  };

  editor.normalizeNode = (entry) => {
    const [node, path] = entry;

    if (isListItem(node)) {
      if (node.children.length === 0) {
        Transforms.insertNodes(editor, createEmptyParagraph(), { at: [...path, 0] });
        return;
      }
      const firstParagraph = node.children.find(isParagraph);
      if (node.children.length !== 1 || !firstParagraph) {
        Transforms.setNodes(editor, { children: [firstParagraph ?? createEmptyParagraph()] }, { at: path });
        return;
      }
    }

    if (isList(node)) {
      for (const [child, childPath] of Node.children(editor, path)) {
        if (SlateElement.isElement(child) && child.type !== 'list-item') {
          Transforms.removeNodes(editor, { at: childPath });
          return;
        }
      }
      if (node.children.length === 0) {
        Transforms.insertNodes(
          editor,
          { type: 'list-item', children: [createEmptyParagraph()] },
          { at: [...path, 0] }
        );
        return;
      }
    }

    normalizeNode(entry);
  };

  return editor;
};
