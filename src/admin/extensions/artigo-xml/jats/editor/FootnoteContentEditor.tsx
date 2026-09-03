/**
 * Compact block editor for `<fn>` body content: paragraphs and lists (`simple` / `bullet`).
 * Preserves `<label>` in the DOM; reads/writes sibling `<p>` and `<list>` nodes only.
 */
import * as React from 'react';
import {
  createEditor,
  Descendant,
  Editor,
  Element as SlateElement,
  NodeEntry,
  Path,
  Range,
} from 'slate';
import { withHistory } from 'slate-history';
import {
  Editable,
  ReactEditor,
  RenderElementProps,
  RenderLeafProps,
  Slate,
  useSlate,
  withReact,
} from 'slate-react';
import styled from 'styled-components';

import { ListBlock, ListItem } from '../styles';
import {
  BlockElement,
  BlockKind,
  deserializeFnContent,
  FOOTNOTE_BLOCK_KINDS,
  replaceFnContent,
} from './advancedBlocks';
import { getElementKey, XrefTarget } from './domMutations';
import { FloatingToolbar } from './FloatingToolbar';
import { LinkDialogProvider } from './LinkDialog';
import { isInsideListItem, withLists } from './listEditing';
import { renderInlineElement, renderInlineLeaf, withInlines } from './inlineModel';
import { SlashMenuList, SLASH_TRIGGER_TYPES, useSlashMenu } from './SlashMenu';

const EMPTY_BLOCK_PLACEHOLDER = "Pressione '/' para inserir lista";
const LIST_ITEM_PLACEHOLDER = 'Item da lista';

const getEmptyBlockPlaceholder = (editor: Editor, parentPath: Path): string | null => {
  let parent;
  try {
    [parent] = Editor.node(editor, parentPath);
  } catch {
    return null;
  }
  if (!SlateElement.isElement(parent)) {
    return null;
  }

  if (parent.type === 'paragraph') {
    if (isInsideListItem(editor, parentPath)) {
      return LIST_ITEM_PLACEHOLDER;
    }
    if (SLASH_TRIGGER_TYPES.has(parent.type)) {
      return EMPTY_BLOCK_PLACEHOLDER;
    }
  }

  return null;
};

const renderElement = (props: RenderElementProps) => {
  const inline = renderInlineElement(props);
  if (inline) {
    return inline;
  }

  const { attributes, children, element } = props;

  switch (element.type) {
    case 'paragraph':
      return <EditorParagraph {...attributes}>{children}</EditorParagraph>;
    case 'list':
      return (
        <ListBlock $bulleted={element.listType === 'bullet'} {...attributes}>
          {children}
        </ListBlock>
      );
    case 'list-item':
      return <ListItem {...attributes}>{children}</ListItem>;
    default:
      return <EditorParagraph {...attributes}>{children}</EditorParagraph>;
  }
};

interface FootnoteContentEditorProps {
  fn: Element;
  doc: Document;
  onBlur?: () => void;
  xrefTargets: XrefTarget[];
  placeholder?: string;
  fontSize?: string;
}

export const FootnoteContentEditor: React.FC<FootnoteContentEditorProps> = ({
  fn,
  doc,
  onBlur,
  xrefTargets,
  placeholder,
  fontSize,
}) => {
  const editor = React.useMemo(
    () => withLists(withInlines(withHistory(withReact(createEditor())))),
    []
  );
  const fnKey = getElementKey(fn);
  const [initialValue] = React.useState<BlockElement[]>(() => deserializeFnContent(fn));

  const handleChange = (newValue: Descendant[]) => {
    const isContentChange = editor.operations.some((op) => op.type !== 'set_selection');
    if (!isContentChange) {
      return;
    }
    replaceFnContent(fn, newValue as BlockElement[], doc);
  };

  return (
    <Slate key={fnKey} editor={editor} initialValue={initialValue} onChange={handleChange}>
      <FootnoteEditorInner
        onBlur={onBlur}
        xrefTargets={xrefTargets}
        placeholder={placeholder}
        fontSize={fontSize}
      />
    </Slate>
  );
};

/**
 * Rendered as `<Slate>`'s child so `useSlate()` re-renders on every edit/selection change —
 * required for the slash menu to open while typing `/`.
 */
const FootnoteEditorInner: React.FC<{
  onBlur?: () => void;
  xrefTargets: XrefTarget[];
  placeholder?: string;
  fontSize?: string;
}> = ({ onBlur, xrefTargets, placeholder, fontSize }) => {
  const editor = useSlate();
  const slashMenu = useSlashMenu(editor, undefined, FOOTNOTE_BLOCK_KINDS as BlockKind[]);

  const decorate = React.useCallback(
    ([node, path]: NodeEntry) => {
      if (Editor.isEditor(node) || path.length === 0) {
        return [];
      }

      const parentPath = Path.parent(path);
      let parent;
      try {
        [parent] = Editor.node(editor, parentPath);
      } catch {
        return [];
      }

      if (!SlateElement.isElement(parent) || Editor.string(editor, parentPath).trim() !== '') {
        return [];
      }

      const { selection } = editor;
      if (
        !selection ||
        !Range.isCollapsed(selection) ||
        !ReactEditor.isFocused(editor) ||
        !Range.includes(selection, parentPath)
      ) {
        return [];
      }

      const blockPlaceholder = getEmptyBlockPlaceholder(editor, parentPath);
      if (!blockPlaceholder) {
        return [];
      }

      const at = Editor.start(editor, parentPath);
      return [{ anchor: at, focus: at, blockPlaceholder }];
    },
    [editor]
  );

  const renderLeaf = React.useCallback((props: RenderLeafProps) => {
    const blockPlaceholder =
      'blockPlaceholder' in props.leaf && typeof props.leaf.blockPlaceholder === 'string'
        ? props.leaf.blockPlaceholder
        : null;
    if (blockPlaceholder) {
      return (
        <>
          {renderInlineLeaf(props)}
          <BlockPlaceholder contentEditable={false} suppressContentEditableWarning>
            {blockPlaceholder}
          </BlockPlaceholder>
        </>
      );
    }
    return renderInlineLeaf(props);
  }, []);

  return (
    <EditorWrapper $fontSize={fontSize}>
      <LinkDialogProvider>
        <Editable
          decorate={decorate}
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          onBlur={onBlur}
          placeholder={placeholder}
          onKeyDown={(event) => {
            slashMenu.handleKeyDown(event);
          }}
          style={{ padding: '10px 12px', outline: 'none', minHeight: '2.5em' }}
        />
        <SlashMenuList controller={slashMenu} editor={editor} />
        <FloatingToolbar xrefTargets={xrefTargets} />
      </LinkDialogProvider>
    </EditorWrapper>
  );
};

const EditorWrapper = styled.div<{ $fontSize?: string }>`
  width: 100%;
  border: 1px solid #dcdce4;
  border-radius: 4px;
  background: #fff;
  font-size: ${({ $fontSize }) => $fontSize ?? 'inherit'};

  &:focus-within {
    border-color: #4945ff;
  }
`;

const EditorParagraph = styled.p`
  position: relative;
  width: 100%;
  min-height: 1.5em;
  margin: 0 0 0.35em !important;
  text-align: left !important;

  &:last-child {
    margin-bottom: 0 !important;
  }
`;

const BlockPlaceholder = styled.span`
  position: absolute;
  top: 0;
  left: 0;
  width: max-content;
  max-width: 100%;
  white-space: nowrap;
  opacity: 0.333;
  pointer-events: none;
  user-select: none;
  color: #8e8ea9;
`;
