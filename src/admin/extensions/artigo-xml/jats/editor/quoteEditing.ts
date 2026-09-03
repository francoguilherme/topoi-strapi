/**
 * Slate editor behavior for the `quote` (`disp-quote`) block:
 *   - Backspace at the start of the first paragraph lifts that paragraph out of the
 *     citation (and removes the quote entirely when it was the only content paragraph).
 *   - Enter on the last empty paragraph exits the quote: that paragraph is removed
 *     and a normal paragraph is created immediately after the citation.
 */
import { Editor, Element as SlateElement, Node as SlateNode, Path, Range, Transforms } from 'slate';

import { createEmptyParagraph, ParagraphElement, QuoteElement } from './advancedBlocks';

const isQuote = (node: SlateNode): node is QuoteElement =>
  SlateElement.isElement(node) && node.type === 'quote';

const isParagraph = (node: SlateNode): node is ParagraphElement =>
  SlateElement.isElement(node) && node.type === 'paragraph';

const currentParagraphEntry = (editor: Editor) =>
  Editor.above(editor, { match: isParagraph });

const isCollapsedAtStart = (editor: Editor, path: Path): boolean => {
  const { selection } = editor;
  return !!selection && Range.isCollapsed(selection) && Editor.isStart(editor, selection.anchor, path);
};

/** Index of the first `paragraph` child in a quote, or -1 if none. */
const firstParagraphIndex = (quote: QuoteElement): number =>
  quote.children.findIndex(isParagraph);

/** Index of the last `paragraph` child in a quote, or -1 if none. */
const lastParagraphIndex = (quote: QuoteElement): number => {
  for (let index = quote.children.length - 1; index >= 0; index -= 1) {
    if (isParagraph(quote.children[index])) {
      return index;
    }
  }
  return -1;
};

/**
 * Backspace at the start of the first paragraph of a quote pulls that paragraph out
 * of the citation (placed immediately before it). If it was the only content
 * paragraph, the quote is removed and replaced by that paragraph — covering the
 * empty-quote case as well.
 */
const liftFirstParagraphOutOfQuote = (editor: Editor): boolean => {
  const paragraphEntry = currentParagraphEntry(editor);
  if (!paragraphEntry) {
    return false;
  }
  const [paragraph, paragraphPath] = paragraphEntry;
  if (!isCollapsedAtStart(editor, paragraphPath)) {
    return false;
  }

  const quotePath = Path.parent(paragraphPath);
  let quote;
  try {
    [quote] = Editor.node(editor, quotePath);
  } catch {
    return false;
  }
  if (!isQuote(quote)) {
    return false;
  }

  const childIndex = paragraphPath[paragraphPath.length - 1];
  if (childIndex !== firstParagraphIndex(quote)) {
    return false;
  }

  const paragraphCount = quote.children.filter(isParagraph).length;
  if (paragraphCount <= 1) {
    const outer: ParagraphElement = { type: 'paragraph', children: paragraph.children };
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: quotePath });
      Transforms.insertNodes(editor, outer, { at: quotePath });
    });
    Transforms.select(editor, Editor.start(editor, quotePath));
    return true;
  }

  Transforms.moveNodes(editor, { at: paragraphPath, to: quotePath });
  Transforms.select(editor, Editor.start(editor, quotePath));
  return true;
};

/**
 * Enter on the last empty paragraph of a quote removes it and creates a normal
 * paragraph right after the quote. If that was the quote's only content paragraph,
 * the empty quote itself is removed too.
 */
const exitQuoteOnEmptyLastParagraphEnter = (editor: Editor): boolean => {
  const paragraphEntry = currentParagraphEntry(editor);
  if (!paragraphEntry) {
    return false;
  }
  const [paragraph, paragraphPath] = paragraphEntry;
  if (!Editor.isEmpty(editor, paragraph)) {
    return false;
  }

  const quotePath = Path.parent(paragraphPath);
  let quote;
  try {
    [quote] = Editor.node(editor, quotePath);
  } catch {
    return false;
  }
  if (!isQuote(quote)) {
    return false;
  }

  const childIndex = paragraphPath[paragraphPath.length - 1];
  if (childIndex !== lastParagraphIndex(quote)) {
    return false;
  }

  const paragraphCount = quote.children.filter(isParagraph).length;
  if (paragraphCount <= 1) {
    // Sole content paragraph: drop the whole quote and leave one outer paragraph.
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: quotePath });
      Transforms.insertNodes(editor, createEmptyParagraph(), { at: quotePath });
    });
    Transforms.select(editor, Editor.start(editor, quotePath));
    return true;
  }

  const afterQuotePath = Path.next(quotePath);
  Editor.withoutNormalizing(editor, () => {
    Transforms.removeNodes(editor, { at: paragraphPath });
    Transforms.insertNodes(editor, createEmptyParagraph(), { at: afterQuotePath });
  });
  Transforms.select(editor, Editor.start(editor, afterQuotePath));
  return true;
};

/** Wires quote Backspace/Enter behavior into a Slate editor. */
export const withQuotes = <T extends Editor>(editor: T): T => {
  const { deleteBackward, insertBreak } = editor;

  editor.deleteBackward = (unit) => {
    if (liftFirstParagraphOutOfQuote(editor)) {
      return;
    }
    deleteBackward(unit);
  };

  editor.insertBreak = () => {
    if (exitQuoteOnEmptyLastParagraphEnter(editor)) {
      return;
    }
    insertBreak();
  };

  return editor;
};
