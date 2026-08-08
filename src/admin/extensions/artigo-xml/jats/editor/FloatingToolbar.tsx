/**
 * Selection-based formatting popover for the advanced body editor: appears above any
 * non-collapsed text selection with mark toggles, a link inserter and (when available)
 * a cross-reference picker. Mirrors `InlineRichEditor`'s fixed toolbar, just positioned
 * next to the selection instead of pinned above the field.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Editor, Range } from 'slate';
import { ReactEditor, useSlate } from 'slate-react';
import styled from 'styled-components';

import { ARTIGO_XML_VIEWPORT_SELECTOR } from '../../constants';
import { insertLink, insertXref, isMarkActive, MarkKey, toggleMark } from './inlineModel';

const getViewportContainer = (editor: Editor): HTMLElement | null => {
  try {
    const anchor = ReactEditor.toDOMNode(editor, editor);
    const container = anchor.closest(ARTIGO_XML_VIEWPORT_SELECTOR);
    return container instanceof HTMLElement ? container : null;
  } catch {
    return null;
  }
};

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

    const updatePosition = () => {
      if (!isVisible || !selection) {
        el.style.display = 'none';
        return;
      }
      try {
        const container = getViewportContainer(editor);
        if (!container) {
          el.style.display = 'none';
          return;
        }

        const containerRect = container.getBoundingClientRect();
        const domRange = ReactEditor.toDOMRange(editor, selection);
        const rect = domRange.getBoundingClientRect();

        const selectionInView =
          rect.bottom > containerRect.top && rect.top < containerRect.bottom;

        if (!selectionInView) {
          el.style.display = 'none';
          return;
        }

        el.style.display = 'flex';

        const padding = 8;
        const top = rect.top - containerRect.top + container.scrollTop - el.offsetHeight - padding;
        let left =
          rect.left - containerRect.left + container.scrollLeft + rect.width / 2 - el.offsetWidth / 2;

        left = Math.max(
          container.scrollLeft + padding,
          Math.min(left, container.scrollLeft + container.clientWidth - el.offsetWidth - padding)
        );

        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
      } catch {
        el.style.display = 'none';
      }
    };

    updatePosition();

    if (!isVisible) {
      return;
    }

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  });

  const portalTarget = getViewportContainer(editor);

  const toolbar = (
    <Popover ref={ref} data-floating-toolbar aria-hidden={!isVisible}>
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
          <option value="" hidden>
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

  return portalTarget ? createPortal(toolbar, portalTarget) : null;
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
  position: absolute;
  z-index: 2;
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
