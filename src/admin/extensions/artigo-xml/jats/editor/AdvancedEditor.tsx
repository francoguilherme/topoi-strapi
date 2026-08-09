import * as React from 'react';
import { createEditor, Descendant, Editor, Element as SlateElement, NodeEntry, Path, Range, Transforms } from 'slate';
import { withHistory } from 'slate-history';
import { Editable, ReactEditor, RenderElementProps, RenderLeafProps, Slate, useSlate, withReact } from 'slate-react';
import styled from 'styled-components';

import {
  addTableColumn,
  addTableRow,
  BlockElement,
  createEmptyParagraph,
  deserializeBody,
  FigureElement,
  getHeaderRowCount,
  removeTableColumn,
  removeTableRow,
  serializeBody,
  setTableHeaderRow,
  TableElement,
} from './advancedBlocks';
import { directChild, ensureChild, listXrefTargets, XrefTarget } from './domMutations';
import { FloatingToolbar } from './FloatingToolbar';
import { renderInlineElement, renderInlineLeaf, withInlines } from './inlineModel';
import { SlashMenuList, SLASH_TRIGGER_TYPES, useSlashMenu } from './SlashMenu';
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

const EMPTY_BLOCK_PLACEHOLDER = "Pressione '/' para adicionar um elemento";

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
  const editor = React.useMemo(() => withInlines(withHistory(withReact(createEditor()))), []);
  const [initialValue] = React.useState<BlockElement[]>(() => deserializeBody(ensureBody(doc.documentElement)));
  // Recomputed every render — `doc` is mutated in place when back matter changes.
  const xrefTargets = listXrefTargets(doc);

  const commitTimeoutRef = React.useRef<number>();

  const flush = React.useCallback(
    (value: BlockElement[]) => {
      const body = ensureBody(doc.documentElement);
      body.replaceChildren(...serializeBody(value, doc));
      commit();
    },
    [doc, commit]
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

  const renderElement = React.useCallback(
    (props: RenderElementProps) => <BlockElementView {...props} editor={editor} xrefTargets={xrefTargets} />,
    [editor, xrefTargets]
  );

  return (
    <EditorShell>
      <ArticleContainer>
        <BodySection data-advanced-editor-section={ADVANCED_EDITOR_SECTION.body}>
          <Slate editor={editor} initialValue={initialValue} onChange={handleChange}>
            <EditorBody renderElement={renderElement} onBlur={handleBlur} xrefTargets={xrefTargets} />
          </Slate>
        </BodySection>
        <BackMatterEditor doc={doc} commit={commit} xrefTargets={xrefTargets} />
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
  renderElement: (props: RenderElementProps) => React.ReactElement;
  onBlur: () => void;
  xrefTargets: XrefTarget[];
}> = ({ renderElement, onBlur, xrefTargets }) => {
  const editor = useSlate();
  const slashMenu = useSlashMenu(editor);

  const decorate = React.useCallback(
    ([node, path]: NodeEntry) => {
      const { selection } = editor;
      if (
        !selection ||
        !Range.isCollapsed(selection) ||
        !ReactEditor.isFocused(editor) ||
        Editor.isEditor(node) ||
        path.length === 0
      ) {
        return [];
      }

      const parentPath = Path.parent(path);
      let parent;
      try {
        [parent] = Editor.node(editor, parentPath);
      } catch {
        return [];
      }

      if (
        !SlateElement.isElement(parent) ||
        !SLASH_TRIGGER_TYPES.has(parent.type) ||
        Editor.string(editor, parentPath).trim() !== '' ||
        !Range.includes(selection, parentPath)
      ) {
        return [];
      }

      const at = Editor.start(editor, parentPath);
      return [{ anchor: at, focus: at, emptyBlockPlaceholder: true }];
    },
    [editor]
  );

  const renderLeaf = React.useCallback((props: RenderLeafProps) => {
    if ('emptyBlockPlaceholder' in props.leaf) {
      return (
        <>
          {renderInlineLeaf(props)}
          <BlockPlaceholder contentEditable={false} suppressContentEditableWarning>
            {EMPTY_BLOCK_PLACEHOLDER}
          </BlockPlaceholder>
        </>
      );
    }
    return renderInlineLeaf(props);
  }, []);

  return (
    <>
      <Editable
        decorate={decorate}
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        onBlur={onBlur}
        onKeyDown={(event) => {
          slashMenu.handleKeyDown(event);
        }}
      />
      <SlashMenuList controller={slashMenu} editor={editor} />
      <FloatingToolbar xrefTargets={xrefTargets} />
    </>
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

// --- Per-block rendering --------------------------------------------------------------

interface BlockElementViewProps extends RenderElementProps {
  editor: Editor;
  xrefTargets: Array<{ id: string; label: string }>;
}

/** Block types that get a draggable/"+"-button gutter on hover — top-level flow and
 * container blocks a user would want to reorder or add siblings around. Sub-parts of a
 * block (a section's heading, a quote's attribution line) and void blocks (table/figure,
 * which render their own self-contained chrome) are excluded. */
const CHROME_TYPES = new Set(['paragraph', 'section', 'quote', 'boxed-text', 'list', 'list-item']);

const BlockElementView: React.FC<BlockElementViewProps> = (props) => {
  const inline = renderInlineElement(props);
  if (inline) {
    return inline;
  }

  const { attributes, children, element, editor, xrefTargets } = props;
  const withChrome = CHROME_TYPES.has(element.type);
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
        return <section {...chromeAttributes}>{children}</section>;

      case 'list': {
        const ListTag = element.ordered ? 'ol' : 'ul';
        return <ListTag {...chromeAttributes}>{children}</ListTag>;
      }

      case 'list-item':
        return <li {...chromeAttributes}>{children}</li>;

      case 'quote':
        return <QuoteBlock {...chromeAttributes}>{children}</QuoteBlock>;

      case 'quote-attrib':
        return <AttribText {...attributes}>{children}</AttribText>;

      case 'boxed-text':
        return <BoxedText {...chromeAttributes}>{children}</BoxedText>;

      case 'table':
        return (
          <TableBlockView attributes={attributes} element={element} editor={editor}>
            {children}
          </TableBlockView>
        );

      case 'figure':
        return (
          <FigureBlockView attributes={attributes} element={element} editor={editor}>
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

  return (
    <BlockRow {...attributes} onDragOver={handleDragOver} onDrop={handleDrop}>
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

const TableBlockView: React.FC<{
  attributes: RenderElementProps['attributes'];
  element: TableElement;
  editor: Editor;
  children: React.ReactNode;
}> = ({ attributes, element, editor, children }) => {
  const headerRowCount = getHeaderRowCount(element.tableTemplate);
  const hasHeader = headerRowCount > 0;
  const colCount = element.rows.reduce((max, row) => Math.max(max, row.length), 1);
  const canRemoveRow = element.rows.length > 1;
  const canRemoveColumn = colCount > 1;

  const setRow = (rowIndex: number, cellIndex: number, text: string) => {
    const rows = element.rows.map((row, r) =>
      r === rowIndex ? row.map((cell, c) => (c === cellIndex ? text : cell)) : row
    );
    updateVoidElement(editor, element, { rows });
  };

  const renderRow = (row: string[], rowIndex: number, cellTag: 'th' | 'td') => {
    const CellTag = cellTag;

    return (
      // eslint-disable-next-line react/no-array-index-key
      <tr key={rowIndex}>
        {row.map((cell, c) => (
          // eslint-disable-next-line react/no-array-index-key
          <CellTag key={c}>
            <FieldInput value={cell} onChange={(e) => setRow(rowIndex, c, e.target.value)} />
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
          <FieldInput
            style={{ flex: 1 }}
            placeholder="Legenda"
            value={element.captionTitle}
            onChange={(e) => updateVoidElement(editor, element, { captionTitle: e.target.value })}
          />
        </Flex2>
        {(element.label || element.captionTitle) && (
          <CaptionHeading>
            {element.label && <strong>{element.label}</strong>}
            {element.label && element.captionTitle ? ': ' : ''}
            {element.captionTitle}
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
        <FieldInput
          placeholder="Nota da tabela"
          value={element.attribText}
          onChange={(e) => updateVoidElement(editor, element, { attribText: e.target.value })}
        />
      </TableWrapper>
    </div>
  );
};

const FigureBlockView: React.FC<{
  attributes: RenderElementProps['attributes'];
  element: FigureElement;
  editor: Editor;
  children: React.ReactNode;
}> = ({ attributes, element, editor, children }) => (
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
        <FieldInput
          style={{ flex: 1 }}
          placeholder="Legenda"
          value={element.captionTitle}
          onChange={(e) => updateVoidElement(editor, element, { captionTitle: e.target.value })}
        />
      </Flex2>
      {(element.label || element.captionTitle) && (
        <CaptionHeading>
          {element.label && <strong>{element.label}</strong>}
          {element.label && element.captionTitle ? ': ' : ''}
          {element.captionTitle}
        </CaptionHeading>
      )}
      {/* Image assets aren't hosted yet, so this intentionally renders broken (same as the read-only renderer). */}
      {element.href && <img src={element.href} alt={element.label || 'Figura'} />}
      <FieldInput
        placeholder="Arquivo de imagem (nome/URL)"
        value={element.href}
        onChange={(e) => updateVoidElement(editor, element, { href: e.target.value })}
      />
      <FieldInput
        placeholder="Nota da figura"
        value={element.attribText}
        onChange={(e) => updateVoidElement(editor, element, { attribText: e.target.value })}
      />
    </FigureWrapper>
  </div>
);

const Flex2 = styled.div<{ gap?: string }>`
  display: flex;
  gap: ${({ gap }) => gap || '4px'};
  margin-bottom: 8px;
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
