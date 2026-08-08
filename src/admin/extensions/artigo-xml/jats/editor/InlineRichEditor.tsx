import * as React from 'react';
import { createEditor, Descendant } from 'slate';
import { withHistory } from 'slate-history';
import { Editable, RenderElementProps, Slate, withReact, useSlate } from 'slate-react';
import styled from 'styled-components';

import { ParagraphElement } from './advancedBlocks';
import {
  deserializeInline,
  insertLink,
  insertXref,
  isMarkActive,
  MarkKey,
  renderInlineElement,
  renderInlineLeaf,
  serializeInline,
  toggleMark,
  withInlines,
} from './inlineModel';

export { deserializeInline, serializeInline } from './inlineModel';
export type { InlineNode, FormattedText, LinkElement, XrefElement, BreakElement } from './inlineModel';

const MarkButton: React.FC<{ mark: MarkKey; label: React.ReactNode; title: string }> = ({
  mark,
  label,
  title,
}) => {
  const editor = useSlate();
  return (
    <ToolbarButton
      type="button"
      title={title}
      $active={isMarkActive(editor, mark)}
      onMouseDown={(event) => {
        event.preventDefault();
        toggleMark(editor, mark);
      }}
    >
      {label}
    </ToolbarButton>
  );
};

const LinkButton: React.FC = () => {
  const editor = useSlate();
  return (
    <ToolbarButton
      type="button"
      title="Inserir link"
      onMouseDown={(event) => {
        event.preventDefault();
        const href = window.prompt('URL do link:');
        if (href) {
          insertLink(editor, href);
        }
      }}
    >
      🔗
    </ToolbarButton>
  );
};

const XrefSelect: React.FC<{ targets: Array<{ id: string; label: string }> }> = ({ targets }) => {
  const editor = useSlate();
  return (
    <ToolbarSelect
      defaultValue=""
      title="Inserir referência cruzada"
      onChange={(event) => {
        const target = targets.find((t) => t.id === event.target.value);
        event.target.value = '';
        if (target) {
          insertXref(editor, target.id, target.label);
        }
      }}
    >
      <option value="" hidden>
        + Ref. cruzada
      </option>
      {targets.map((target) => (
        <option key={target.id} value={target.id}>
          {target.label}
        </option>
      ))}
    </ToolbarSelect>
  );
};

const renderElement = (props: RenderElementProps) =>
  renderInlineElement(props) ?? <EditorParagraph {...props.attributes}>{props.children}</EditorParagraph>;

interface InlineRichEditorProps {
  /** DOM used to create the serialized output nodes; typically the shared article `Document`. */
  doc: Document;
  /** Seeds the editor's initial content. Only read once per mount — give this component a
   * `key` tied to the target element/field when it needs to reset to a different value. */
  initialNodes: ArrayLike<ChildNode>;
  /** Called with fresh JATS DOM nodes on every content change. */
  onChange: (nodes: Node[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Font size for the editable area; defaults to compact form-field sizing. */
  fontSize?: string;
  /** Enables the cross-reference picker, pointing at the article's footnotes/references. */
  xrefTargets?: Array<{ id: string; label: string }>;
}

/**
 * Minimal rich-text editor for a single run of JATS inline content (a paragraph, a
 * title, an abstract, a footnote/reference body...). Supports the marks and inline
 * elements JATS articles commonly use for this kind of text — bold/italic/underline/
 * superscript/subscript, external links and cross-references — without exposing raw
 * XML tags to the user. Shares its inline model with the block-level `AdvancedEditor`
 * (see `inlineModel.ts`), so both stay in sync automatically.
 */
export const InlineRichEditor: React.FC<InlineRichEditorProps> = ({
  doc,
  initialNodes,
  onChange,
  onBlur,
  placeholder,
  fontSize,
  xrefTargets,
}) => {
  const editor = React.useMemo(() => withInlines(withHistory(withReact(createEditor()))), []);
  const [initialValue] = React.useState<ParagraphElement[]>(() => [
    { type: 'paragraph', children: deserializeInline(initialNodes) },
  ]);

  const handleChange = (newValue: Descendant[]) => {
    const isContentChange = editor.operations.some((op) => op.type !== 'set_selection');
    if (!isContentChange) {
      return;
    }
    const [paragraph] = newValue as ParagraphElement[];
    onChange(serializeInline(paragraph.children, doc));
  };

  return (
    <EditorWrapper>
      <Slate editor={editor} initialValue={initialValue} onChange={handleChange}>
        <Toolbar>
          <MarkButton mark="bold" label={<strong>B</strong>} title="Negrito" />
          <MarkButton mark="italic" label={<em>I</em>} title="Itálico" />
          <MarkButton mark="underline" label={<u>S</u>} title="Sublinhado" />
          <MarkButton mark="sup" label="x²" title="Sobrescrito" />
          <MarkButton mark="sub" label="x₂" title="Subscrito" />
          <LinkButton />
          {xrefTargets && xrefTargets.length > 0 && <XrefSelect targets={xrefTargets} />}
        </Toolbar>
        <EditableArea
          $fontSize={fontSize}
          renderElement={renderElement}
          renderLeaf={renderInlineLeaf}
          onBlur={onBlur}
          placeholder={placeholder}
        />
      </Slate>
    </EditorWrapper>
  );
};

const EditorWrapper = styled.div`
  width: 100%;
  border: 1px solid #dcdce4;
  border-radius: 4px;
  background: #fff;

  &:focus-within {
    border-color: #4945ff;
  }
`;

const Toolbar = styled.div`
  display: flex;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid #eaeaef;
  background: #fafafb;
`;

const ToolbarButton = styled.button<{ $active?: boolean }>`
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  font-size: 12px;
  line-height: 1;
  border: 1px solid ${({ $active }) => ($active ? '#4945ff' : 'transparent')};
  border-radius: 4px;
  background: ${({ $active }) => ($active ? '#f0f0ff' : 'transparent')};
  color: #32324d;
  cursor: pointer;

  &:hover {
    background: #f0f0ff;
  }
`;

const ToolbarSelect = styled.select`
  height: 26px;
  font-size: 12px;
  border: 1px solid #dcdce4;
  border-radius: 4px;
  background: #fff;
  color: #32324d;
`;

const EditableArea = styled(Editable)<{ $fontSize?: string }>`
  padding: ${({ $fontSize }) => ($fontSize ? '10px 12px' : '8px 10px')};
  min-height: 2.5em;
  font-size: ${({ $fontSize }) => $fontSize ?? '0.875rem'};
  line-height: 1.5;
  outline: none;

  [data-slate-placeholder] {
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
  }
`;

const EditorParagraph = styled.p`
  position: relative;
  width: 100%;
  min-height: 1.5em;
  margin: 0 !important;
  text-align: left !important;
`;
