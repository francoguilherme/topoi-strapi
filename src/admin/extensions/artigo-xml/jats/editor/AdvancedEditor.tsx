import * as React from 'react';
import { createEditor, Descendant, Editor, Element as SlateElement, NodeEntry, Path, Range, Transforms } from 'slate';
import { withHistory } from 'slate-history';
import { Editable, ReactEditor, RenderElementProps, RenderLeafProps, Slate, useSlate, withReact } from 'slate-react';
import styled from 'styled-components';

import {
  addTableColumn,
  addTableRow,
  BlockElement,
  BlockKind,
  collectMediaXrefTargets,
  createEmptyParagraph,
  deserializeBody,
  ensureMediaBlockIds,
  FigureElement,
  getHeaderRowCount,
  isInlineEmpty,
  nextMediaBlockId,
  removeTableColumn,
  removeTableRow,
  serializeBody,
  setTableHeaderRow,
  syncMediaBlockIdsToEditor,
  TableElement,
} from './advancedBlocks';
import { directChild, ensureChild, listXrefTargets, XrefTarget } from './domMutations';
import { FloatingToolbar } from './FloatingToolbar';
import { LinkDialogProvider } from './LinkDialog';
import { InlineRichEditor } from './InlineRichEditor';
import { InlineNode, InlineContentPreview, renderInlineElement, renderInlineLeaf, withInlines } from './inlineModel';
import { withQuotes } from './quoteEditing';
import { handleSectionTabKey, withSections } from './sectionEditing';
import { isInsideQuote, SlashMenuList, SLASH_TRIGGER_TYPES, useSlashMenu } from './SlashMenu';
import { isInsideVerseGroup, withVerses } from './verseEditing';
import { useArticleDocument } from './useArticleDocument';
import { BackMatterEditor } from './BackMatterEditor';
import { ADVANCED_EDITOR_SECTION, ADVANCED_EDITOR_SECTION_NAV_OFFSET } from './advancedEditorSections';
import {
  ArticleContainer,
  AttribText,
  BoxedText,
  CaptionHeading,
  FigureWrapper,
  SectionHeading,
  TableWrapper,
  VerseGroup,
  VerseLine,
} from '../styles';

const ensureBody = (article: Element): Element => {
  const existing = directChild(article, 'body');
  if (existing) {
    return existing;
  }
  const before = directChild(article, 'back') || null;
  return ensureChild(article, 'body', { before });
};

/** Debounce (ms) between a content keystroke and re-serializing/committing the whole body. */
const COMMIT_DEBOUNCE_MS = 800;

const EMPTY_BLOCK_PLACEHOLDER = "Pressione '/' para adicionar um bloco";
const SECTION_TITLE_PLACEHOLDER = 'Título da seção';
const SECTION_CONTENT_PLACEHOLDER = 'Conteúdo da seção';
const VERSE_LINE_PLACEHOLDER = 'Verso';

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

  if (parent.type === 'heading') {
    return SECTION_TITLE_PLACEHOLDER;
  }

  if (parent.type === 'paragraph') {
    if (isInsideQuote(editor, parentPath)) {
      return null;
    }
    const grandparentPath = Path.parent(parentPath);
    try {
      const [grandparent] = Editor.node(editor, grandparentPath);
      if (SlateElement.isElement(grandparent) && grandparent.type === 'section') {
        return SECTION_CONTENT_PLACEHOLDER;
      }
    } catch {
      // ignore
    }
  }

  if (parent.type === 'verse-line') {
    return VERSE_LINE_PLACEHOLDER;
  }

  if (SLASH_TRIGGER_TYPES.has(parent.type)) {
    return EMPTY_BLOCK_PLACEHOLDER;
  }

  return null;
};

interface AdvancedEditorProps {
  xml: string;
  onChange: (xml: string) => void;
}

/**
 * Notion-like editor for the article's `<body>`: a single continuous, WYSIWYG-ish Slate
 * document instead of per-field forms. Unlike `BodyFields` (which mutates the live JATS
 * DOM directly per field), this editor treats the Slate value as the primary editable
 * model — see `advancedBlocks.ts` for the schema and (de)serialization.
 */
export const AdvancedEditor: React.FC<AdvancedEditorProps> = ({ xml, onChange }) => {
  const { doc, commit } = useArticleDocument(xml, onChange);
  const editor = React.useMemo(
    () => withVerses(withQuotes(withSections(withInlines(withHistory(withReact(createEditor())))))),
    []
  );
  const [initialValue] = React.useState<BlockElement[]>(() => deserializeBody(ensureBody(doc.documentElement)));
  const backMatterXrefTargets = listXrefTargets(doc);

  const commitTimeoutRef = React.useRef<number>();

  const flush = React.useCallback(
    (value: BlockElement[]) => {
      const withIds = ensureMediaBlockIds(value, doc);
      syncMediaBlockIdsToEditor(editor, value, withIds);
      const body = ensureBody(doc.documentElement);
      body.replaceChildren(...serializeBody(withIds, doc));
      commit();
    },
    [doc, commit, editor]
  );

  const scheduleCommit = React.useCallback(
    (value: BlockElement[]) => {
      if (commitTimeoutRef.current) {
        window.clearTimeout(commitTimeoutRef.current);
      }
      commitTimeoutRef.current = window.setTimeout(() => flush(value), COMMIT_DEBOUNCE_MS);
    },
    [flush]
  );

  React.useEffect(
    () => () => {
      if (commitTimeoutRef.current) {
        window.clearTimeout(commitTimeoutRef.current);
      }
    },
    []
  );

  const handleChange = (newValue: Descendant[]) => {
    const isContentChange = editor.operations.some((op) => op.type !== 'set_selection');
    if (!isContentChange) {
      return;
    }
    scheduleCommit(newValue as BlockElement[]);
  };

  const handleBlur = () => {
    if (commitTimeoutRef.current) {
      window.clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = undefined;
    }
    flush(editor.children as BlockElement[]);
  };

  return (
    <EditorShell>
      <ArticleContainer>
        <BodySection data-advanced-editor-section={ADVANCED_EDITOR_SECTION.body}>
          <Slate editor={editor} initialValue={initialValue} onChange={handleChange}>
            <EditorBody doc={doc} editor={editor} onBlur={handleBlur} backMatterXrefTargets={backMatterXrefTargets} />
          </Slate>
        </BodySection>
        <BackMatterEditor doc={doc} commit={commit} xrefTargets={backMatterXrefTargets} />
      </ArticleContainer>
    </EditorShell>
  );
};

/**
 * Rendered as `<Slate>`'s child (rather than inline in `AdvancedEditor`) specifically so
 * `useSlate()` subscribes it to re-render on every selection/content change — needed for
 * the slash menu and floating toolbar, both derived live from the current cursor/selection.
 */
const EditorBody: React.FC<{
  doc: Document;
  editor: Editor;
  onBlur: () => void;
  backMatterXrefTargets: XrefTarget[];
}> = ({ doc, editor, onBlur, backMatterXrefTargets }) => {
  const slateEditor = useSlate();
  const slashMenu = useSlashMenu(
    slateEditor,
    React.useCallback(
      (kind: BlockKind, block: BlockElement) => {
        if (kind === 'figure' && block.type === 'figure') {
          return { ...block, figureId: nextMediaBlockId(doc, 'figure') };
        }
        if (kind === 'table' && block.type === 'table') {
          return { ...block, tableId: nextMediaBlockId(doc, 'table') };
        }
        return block;
      },
      [doc]
    )
  );

  const bodyBlocks = slateEditor.children as BlockElement[];
  const xrefTargets = React.useMemo(
    () => [...backMatterXrefTargets, ...collectMediaXrefTargets(bodyBlocks)],
    [backMatterXrefTargets, bodyBlocks]
  );

  const renderElement = React.useCallback(
    (props: RenderElementProps) => <BlockElementView {...props} editor={editor} xrefTargets={xrefTargets} />,
    [editor, xrefTargets]
  );

  const decorate = React.useCallback(
    ([node, path]: NodeEntry) => {
      if (Editor.isEditor(node) || path.length === 0) {
        return [];
      }

      const parentPath = Path.parent(path);
      let parent;
      try {
        [parent] = Editor.node(slateEditor, parentPath);
      } catch {
        return [];
      }

      if (!SlateElement.isElement(parent) || Editor.string(slateEditor, parentPath).trim() !== '') {
        return [];
      }

      // Section titles always show their placeholder while empty, even without focus.
      if (parent.type === 'heading') {
        const at = Editor.start(slateEditor, parentPath);
        return [{ anchor: at, focus: at, blockPlaceholder: SECTION_TITLE_PLACEHOLDER }];
      }

      const { selection } = slateEditor;
      if (
        !selection ||
        !Range.isCollapsed(selection) ||
        !ReactEditor.isFocused(slateEditor) ||
        !Range.includes(selection, parentPath)
      ) {
        return [];
      }

      const placeholder = getEmptyBlockPlaceholder(slateEditor, parentPath);
      if (!placeholder) {
        return [];
      }

      const at = Editor.start(slateEditor, parentPath);
      return [{ anchor: at, focus: at, blockPlaceholder: placeholder }];
    },
    [slateEditor]
  );

  const renderLeaf = React.useCallback((props: RenderLeafProps) => {
    const placeholder =
      'blockPlaceholder' in props.leaf && typeof props.leaf.blockPlaceholder === 'string'
        ? props.leaf.blockPlaceholder
        : null;
    if (placeholder) {
      return (
        <>
          {renderInlineLeaf(props)}
          <BlockPlaceholder contentEditable={false} suppressContentEditableWarning>
            {placeholder}
          </BlockPlaceholder>
        </>
      );
    }
    return renderInlineLeaf(props);
  }, []);

  return (
    <LinkDialogProvider>
      <Editable
        decorate={decorate}
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (slashMenu.handleKeyDown(event)) {
            return;
          }
          handleSectionTabKey(slateEditor, event);
        }}
      />
      <SlashMenuList controller={slashMenu} editor={slateEditor} />
      <FloatingToolbar xrefTargets={xrefTargets} />
    </LinkDialogProvider>
  );
};

const BodySection = styled.div`
  scroll-margin-top: ${ADVANCED_EDITOR_SECTION_NAV_OFFSET}px;
`;

const EditorShell = styled.div`
  padding: 2rem 1.5rem;
  min-height: 100%;

  [data-slate-editor='true'] {
    outline: none;
  }

  [data-slate-node='text'] {
    position: relative;
  }
`;

const BlockPlaceholder = styled.span`
  position: absolute;
  width: max-content;
  top: 0;
  left: 0;
  pointer-events: none;
  user-select: none;
  color: #8e8ea9;
`;

/** Body blocks inside a section sit slightly inset; the `<title>` (first child) stays flush. */
const SectionBlock = styled.section`
  & > *:not(:first-child) {
    padding-left: 1rem;
  }
`;

// --- Per-block rendering --------------------------------------------------------------

interface BlockElementViewProps extends RenderElementProps {
  editor: Editor;
  xrefTargets: XrefTarget[];
}

/** Block types that get a draggable/"+"-button gutter on hover — top-level flow and
 * container blocks a user would want to reorder or add siblings around. Sub-parts of a
 * block (a section's heading, a quote's attribution line) are excluded. Void blocks
 * (table/figure) are included so users can still insert a sibling below them. */
const CHROME_TYPES = new Set([
  'paragraph',
  'section',
  'quote',
  'verse-group',
  'boxed-text',
  'list',
  'list-item',
  'table',
  'figure',
]);

const BlockElementView: React.FC<BlockElementViewProps> = (props) => {
  const inline = renderInlineElement(props);
  if (inline) {
    return inline;
  }

  const { attributes, children, element, editor, xrefTargets } = props;
  // Quotes only hold plain paragraphs — no "+" gutter on those inner paragraphs
  // (the quote block itself still has chrome to add siblings below the citation).
  let path: Path | null = null;
  try {
    path = ReactEditor.findPath(editor, element);
  } catch {
    path = null;
  }
  const withChrome =
    CHROME_TYPES.has(element.type) &&
    !(element.type === 'paragraph' && path !== null && isInsideQuote(editor, path)) &&
    !(element.type === 'verse-line' && path !== null && isInsideVerseGroup(editor, path));
  // Chrome types get their tag rendered *without* Slate's `attributes` — `BlockChrome`
  // takes ownership of `attributes` on its own outer wrapper instead (see below).
  const chromeAttributes = withChrome ? EMPTY_ATTRIBUTES : attributes;

  const content = (() => {
    switch (element.type) {
      case 'paragraph':
        return <p {...chromeAttributes}>{children}</p>;

      case 'heading': {
        const depth = Math.min(element.depth, 4);
        const tag = depth <= 2 ? 'h2' : depth === 3 ? 'h3' : 'h4';
        return (
          <SectionHeading as={tag} $depth={depth} {...attributes}>
            {children}
          </SectionHeading>
        );
      }

      case 'section':
        return <SectionBlock {...chromeAttributes}>{children}</SectionBlock>;

      case 'list': {
        const ListTag = element.ordered ? 'ol' : 'ul';
        return <ListTag {...chromeAttributes}>{children}</ListTag>;
      }

      case 'list-item':
        return <li {...chromeAttributes}>{children}</li>;

      case 'quote':
        return <QuoteBlock {...chromeAttributes}>{children}</QuoteBlock>;

      case 'verse-group':
        return <VerseGroup {...chromeAttributes}>{children}</VerseGroup>;

      case 'verse-line':
        return (
          <VerseLine {...attributes}>
            {children}
          </VerseLine>
        );

      case 'quote-attrib':
        return <AttribText {...attributes}>{children}</AttribText>;

      case 'boxed-text':
        return <BoxedText {...chromeAttributes}>{children}</BoxedText>;

      case 'table':
        return (
          <TableBlockView
            attributes={chromeAttributes}
            element={element}
            editor={editor}
            xrefTargets={xrefTargets}
          >
            {children}
          </TableBlockView>
        );

      case 'figure':
        return (
          <FigureBlockView
            attributes={chromeAttributes}
            element={element}
            editor={editor}
            xrefTargets={xrefTargets}
          >
            {children}
          </FigureBlockView>
        );

      default:
        return <p {...attributes}>{children}</p>;
    }
  })();

  if (!withChrome) {
    return content;
  }

  return (
    <BlockChrome attributes={attributes} editor={editor} element={element}>
      {content}
    </BlockChrome>
  );
};

const EMPTY_ATTRIBUTES = {} as RenderElementProps['attributes'];

const QuoteBlock = styled.blockquote`
  margin: 1em 0;
  padding-left: 1em;
  border-left: 3px solid #dcdce4;
  color: #32324d;

  p {
    text-align: left;
  }
`;

// --- Hover chrome: drag handle + "add block below" -----------------------------------

const DRAG_MIME = 'application/x-jats-advanced-block-path';

const BlockChrome: React.FC<{
  attributes: RenderElementProps['attributes'];
  editor: Editor;
  element: SlateElement;
  children: React.ReactNode;
}> = ({ attributes, editor, element, children }) => {
  const handleDragStart = (event: React.DragEvent) => {
    const path = ReactEditor.findPath(editor, element);
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(path));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (event.dataTransfer.types.includes(DRAG_MIME)) {
      event.preventDefault();
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    const raw = event.dataTransfer.getData(DRAG_MIME);
    if (!raw) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      const fromPath = JSON.parse(raw) as Path;
      const toPath = ReactEditor.findPath(editor, element);
      // Reordering is restricted to siblings within the same parent — dropping across
      // different containers (e.g. into a different section) is a no-op for now.
      if (Path.equals(fromPath, toPath) || !Path.equals(Path.parent(fromPath), Path.parent(toPath))) {
        return;
      }
      Transforms.moveNodes(editor, { at: fromPath, to: toPath });
    } catch {
      // Ignore malformed/foreign drag payloads.
    }
  };

  const handleAddBelow = (event: React.MouseEvent) => {
    event.preventDefault();
    const path = ReactEditor.findPath(editor, element);
    const nextPath = Path.next(path);
    // A `list`'s direct children may only be `list-item`s (never a bare paragraph) —
    // every other container accepts a plain paragraph as a sibling.
    const sibling =
      element.type === 'list-item'
        ? { type: 'list-item' as const, children: [createEmptyParagraph()] }
        : createEmptyParagraph();
    Transforms.insertNodes(editor, sibling, { at: nextPath });
    Transforms.select(editor, Editor.start(editor, nextPath));
    ReactEditor.focus(editor);
  };

  // Table/figure keep their own non-editable chrome; when BlockChrome owns Slate's
  // `attributes`, the outer row must stay non-editable so the caret cannot land in it.
  const isVoidLike = element.type === 'table' || element.type === 'figure';

  return (
    <BlockRow
      {...attributes}
      contentEditable={isVoidLike ? false : undefined}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <BlockGutter contentEditable={false}>
        <GutterButton type="button" title="Adicionar bloco abaixo" onMouseDown={handleAddBelow}>
          +
        </GutterButton>
        {/* <GutterButton type="button" title="Arrastar para reordenar" draggable onDragStart={handleDragStart} $grab>
          ⠿
        </GutterButton> */}
      </BlockGutter>
      <BlockContent>{children}</BlockContent>
    </BlockRow>
  );
};

const BlockRow = styled.div`
  position: relative;
`;

const BlockGutter = styled.div`
  position: absolute;
  left: -34px;
  top: 0.15em;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.1s ease-in;

  ${BlockRow}:hover & {
    opacity: 1;
  }
`;

const GutterButton = styled.button<{ $grab?: boolean }>`
  width: 20px;
  height: 20px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #8e8ea9;
  font-size: 13px;
  line-height: 1;
  cursor: ${({ $grab }) => ($grab ? 'grab' : 'pointer')};

  &:hover {
    background: #eaeaef;
    color: #32324d;
  }
`;

const BlockContent = styled.div`
  display: contents;
`;

// --- Void blocks: table / figure -------------------------------------------------------
// Slate makes void elements' own content non-editable and expects fully custom React UI
// in its place; `children` is still rendered (per Slate convention) but visually hidden,
// purely so Slate can track the void node's position for selection/cursor purposes.

const updateVoidElement = <T extends SlateElement>(editor: Editor, element: T, patch: Partial<T>): void => {
  const path = ReactEditor.findPath(editor, element);
  Transforms.setNodes(editor, patch, { at: path });
};

const VoidChildren: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>{children}</span>
);

const VoidInlineField: React.FC<{
  initialInline: InlineNode[];
  onInlineChange: (nodes: InlineNode[]) => void;
  placeholder?: string;
  xrefTargets: XrefTarget[];
  fieldKey: string;
}> = ({ initialInline, onInlineChange, placeholder, xrefTargets, fieldKey }) => (
  <InlineRichEditor
    key={fieldKey}
    initialInline={initialInline}
    onInlineChange={onInlineChange}
    placeholder={placeholder}
    xrefTargets={xrefTargets}
    toolbar="floating"
    compact
  />
);

const TableBlockView: React.FC<{
  attributes: RenderElementProps['attributes'];
  element: TableElement;
  editor: Editor;
  xrefTargets: XrefTarget[];
  children: React.ReactNode;
}> = ({ attributes, element, editor, xrefTargets, children }) => {
  const headerRowCount = getHeaderRowCount(element.tableTemplate);
  const hasHeader = headerRowCount > 0;
  const colCount = element.rows.reduce((max, row) => Math.max(max, row.length), 1);
  const canRemoveRow = element.rows.length > 1;
  const canRemoveColumn = colCount > 1;

  const setCell = (rowIndex: number, cellIndex: number, inline: InlineNode[]) => {
    const rows = element.rows.map((row, r) =>
      r === rowIndex ? row.map((cell, c) => (c === cellIndex ? inline : cell)) : row
    );
    updateVoidElement(editor, element, { rows });
  };

  const renderRow = (row: InlineNode[][], rowIndex: number, cellTag: 'th' | 'td') => {
    const CellTag = cellTag;

    return (
      // eslint-disable-next-line react/no-array-index-key
      <tr key={rowIndex}>
        {row.map((cell, c) => (
          // eslint-disable-next-line react/no-array-index-key
          <CellTag key={c}>
            <VoidInlineField
              fieldKey={`${element.tableId || 'table'}-r${rowIndex}-c${c}`}
              initialInline={cell}
              placeholder="Célula"
              xrefTargets={xrefTargets}
              onInlineChange={(inline) => setCell(rowIndex, c, inline)}
            />
          </CellTag>
        ))}
      </tr>
    );
  };

  return (
    <div {...attributes} contentEditable={false}>
      <VoidChildren>{children}</VoidChildren>
      <TableWrapper>
        <Flex2 gap="8px">
          <FieldInput
            style={{ width: 100 }}
            placeholder="Rótulo"
            value={element.label}
            onChange={(e) => updateVoidElement(editor, element, { label: e.target.value })}
          />
          <CaptionField style={{ flex: 1 }}>
            <VoidInlineField
              fieldKey={`${element.tableId || 'table'}-caption`}
              initialInline={element.captionTitle}
              placeholder="Legenda"
              xrefTargets={xrefTargets}
              onInlineChange={(captionTitle) => updateVoidElement(editor, element, { captionTitle })}
            />
          </CaptionField>
        </Flex2>
        {(element.label || !isInlineEmpty(element.captionTitle)) && (
          <CaptionHeading>
            {element.label && <strong>{element.label}</strong>}
            {element.label && !isInlineEmpty(element.captionTitle) ? ': ' : ''}
            <InlineContentPreview nodes={element.captionTitle} />
          </CaptionHeading>
        )}
        <TableStructureActions>
          <TableActionButton
            type="button"
            $active={hasHeader}
            title={hasHeader ? 'Remover cabeçalho da primeira linha' : 'Usar primeira linha como cabeçalho'}
            onClick={() => updateVoidElement(editor, element, setTableHeaderRow(element, !hasHeader))}
          >
            Cabeçalho
          </TableActionButton>
          <TableActionButton
            type="button"
            title="Adicionar linha"
            onClick={() => updateVoidElement(editor, element, addTableRow(element))}
          >
            + Linha
          </TableActionButton>
          <TableActionButton
            type="button"
            title="Remover última linha"
            disabled={!canRemoveRow}
            onClick={() => {
              const patch = removeTableRow(element);
              if (patch) {
                updateVoidElement(editor, element, patch);
              }
            }}
          >
            − Linha
          </TableActionButton>
          <TableActionButton
            type="button"
            title="Adicionar coluna"
            onClick={() => updateVoidElement(editor, element, addTableColumn(element))}
          >
            + Coluna
          </TableActionButton>
          <TableActionButton
            type="button"
            title="Remover última coluna"
            disabled={!canRemoveColumn}
            onClick={() => {
              const patch = removeTableColumn(element);
              if (patch) {
                updateVoidElement(editor, element, patch);
              }
            }}
          >
            − Coluna
          </TableActionButton>
        </TableStructureActions>
        <table>
          {headerRowCount > 0 && (
            <thead>{element.rows.slice(0, headerRowCount).map((row, r) => renderRow(row, r, 'th'))}</thead>
          )}
          <tbody>
            {element.rows.slice(headerRowCount).map((row, r) => renderRow(row, headerRowCount + r, 'td'))}
          </tbody>
        </table>
        <VoidInlineField
          fieldKey={`${element.tableId || 'table'}-attrib`}
          initialInline={element.attrib}
          placeholder="Nota da tabela"
          xrefTargets={xrefTargets}
          onInlineChange={(attrib) => updateVoidElement(editor, element, { attrib })}
        />
      </TableWrapper>
    </div>
  );
};

const FigureBlockView: React.FC<{
  attributes: RenderElementProps['attributes'];
  element: FigureElement;
  editor: Editor;
  xrefTargets: XrefTarget[];
  children: React.ReactNode;
}> = ({ attributes, element, editor, xrefTargets, children }) => (
  <div {...attributes} contentEditable={false}>
    <VoidChildren>{children}</VoidChildren>
    <FigureWrapper>
      <Flex2 gap="8px">
        <FieldInput
          style={{ width: 100 }}
          placeholder="Rótulo"
          value={element.label}
          onChange={(e) => updateVoidElement(editor, element, { label: e.target.value })}
        />
        <CaptionField style={{ flex: 1 }}>
          <VoidInlineField
            fieldKey={`${element.figureId || 'figure'}-caption`}
            initialInline={element.captionTitle}
            placeholder="Legenda"
            xrefTargets={xrefTargets}
            onInlineChange={(captionTitle) => updateVoidElement(editor, element, { captionTitle })}
          />
        </CaptionField>
      </Flex2>
      {(element.label || !isInlineEmpty(element.captionTitle)) && (
        <CaptionHeading>
          {element.label && <strong>{element.label}</strong>}
          {element.label && !isInlineEmpty(element.captionTitle) ? ': ' : ''}
          <InlineContentPreview nodes={element.captionTitle} />
        </CaptionHeading>
      )}
      {element.href && <img src={element.href} alt={element.label || 'Figura'} />}
      <FieldInput
        placeholder="Arquivo de imagem (nome/URL)"
        value={element.href}
        onChange={(e) => updateVoidElement(editor, element, { href: e.target.value })}
      />
      <VoidInlineField
        fieldKey={`${element.figureId || 'figure'}-attrib`}
        initialInline={element.attrib}
        placeholder="Nota da figura"
        xrefTargets={xrefTargets}
        onInlineChange={(attrib) => updateVoidElement(editor, element, { attrib })}
      />
    </FigureWrapper>
  </div>
);

const Flex2 = styled.div<{ gap?: string }>`
  display: flex;
  gap: ${({ gap }) => gap || '4px'};
  margin-bottom: 8px;
`;

const CaptionField = styled.div`
  min-width: 0;
`;

const FieldInput = styled.input`
  width: 100%;
  font: inherit;
  font-size: 0.9em;
  padding: 4px 6px;
  border: 1px solid #dcdce4;
  border-radius: 4px;
  background: #fff;
  margin-bottom: 4px;

  &:focus {
    outline: none;
    border-color: #4945ff;
  }
`;

const TableStructureActions = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
`;

const TableActionButton = styled.button<{ $active?: boolean; disabled?: boolean }>`
  padding: 2px 8px;
  font: inherit;
  font-size: 0.75em;
  line-height: 1.4;
  border: 1px solid ${({ $active }) => ($active ? '#4945ff' : '#dcdce4')};
  border-radius: 4px;
  background: ${({ $active }) => ($active ? '#f0f0ff' : '#fff')};
  color: ${({ $active }) => ($active ? '#4945ff' : '#666687')};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.45 : 1)};
  white-space: nowrap;

  &:hover:not(:disabled) {
    border-color: #4945ff;
    color: #4945ff;
  }
`;
