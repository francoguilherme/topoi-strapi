/**
 * Selection-based formatting popover for the advanced body editor: appears above any
 * non-collapsed text selection with mark toggles, a link inserter and (when available)
 * a cross-reference picker. Mirrors `InlineRichEditor`'s fixed toolbar, just positioned
 * next to the selection instead of pinned above the field.
 */
import * as React from 'react';
import { Editor, Range } from 'slate';
import { ReactEditor, useSlate } from 'slate-react';
import styled from 'styled-components';

import { insertLink, insertXref, isMarkActive, MarkKey, toggleMark } from './inlineModel';

interface FloatingToolbarProps {
  xrefTargets: Array<{ id: string; label: string }>;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ xrefTargets }) => {
  const editor = useSlate();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const { selection } = editor;

  const isVisible =
    !!selection &&
    ReactEditor.isFocused(editor) &&
    !Range.isCollapsed(selection) &&
    Editor.string(editor, selection).trim() !== '';

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (!isVisible || !selection) {
      el.style.display = 'none';
      return;
    }
    try {
      const domRange = ReactEditor.toDOMRange(editor, selection);
      const rect = domRange.getBoundingClientRect();
      el.style.display = 'flex';
      const top = rect.top - el.offsetHeight - 8;
      const left = rect.left + rect.width / 2 - el.offsetWidth / 2;
      el.style.top = `${Math.max(8, top)}px`;
      el.style.left = `${Math.max(8, left)}px`;
    } catch {
      el.style.display = 'none';
    }
  });

  return (
    <Popover ref={ref}>
      <MarkButton editor={editor} mark="bold" label={<strong>B</strong>} title="Negrito" />
      <MarkButton editor={editor} mark="italic" label={<em>I</em>} title="Itálico" />
      <MarkButton editor={editor} mark="underline" label={<u>S</u>} title="Sublinhado" />
      <MarkButton editor={editor} mark="sup" label="x²" title="Sobrescrito" />
      <MarkButton editor={editor} mark="sub" label="x₂" title="Subscrito" />
      <Divider />
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
      {xrefTargets.length > 0 && (
        <ToolbarSelect
          defaultValue=""
          title="Inserir referência cruzada"
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const target = xrefTargets.find((t) => t.id === event.target.value);
            event.target.value = '';
            if (target) {
              insertXref(editor, target.id, target.label);
            }
          }}
        >
          <option value="" disabled>
            + Ref. cruzada
          </option>
          {xrefTargets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </ToolbarSelect>
      )}
    </Popover>
  );
};

const MarkButton: React.FC<{ editor: Editor; mark: MarkKey; label: React.ReactNode; title: string }> = ({
  editor,
  mark,
  label,
  title,
}) => (
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

const Popover = styled.div`
  position: fixed;
  z-index: 30;
  display: none;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: #212134;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(33, 33, 52, 0.3);
`;

const Divider = styled.span`
  width: 1px;
  height: 18px;
  background: #4a4a68;
  margin: 0 4px;
`;

const ToolbarButton = styled.button<{ $active?: boolean }>`
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  font-size: 12px;
  line-height: 1;
  border: none;
  border-radius: 4px;
  background: ${({ $active }) => ($active ? '#4945ff' : 'transparent')};
  color: #fff;
  cursor: pointer;

  &:hover {
    background: ${({ $active }) => ($active ? '#4945ff' : '#32324d')};
  }
`;

const ToolbarSelect = styled.select`
  height: 26px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  background: #32324d;
  color: #fff;
`;
