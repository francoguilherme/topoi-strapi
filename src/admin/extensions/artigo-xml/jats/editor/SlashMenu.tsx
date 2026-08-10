/**
 * "/" command palette: typing `/` as the only content of an otherwise-empty paragraph
 * (or quote attribution line) opens a dropdown of block types; picking one replaces
 * that paragraph with a fresh block of the chosen kind. `useSlashMenu` owns detection,
 * filtering and keyboard navigation; `SlashMenuList` is the (purely presentational)
 * dropdown itself.
 */
import * as React from 'react';
import { Editor, Element as SlateElement, Node as SlateNode, Path, Range, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import styled from 'styled-components';

import { BLOCK_KIND_LABELS, BlockKind, createEmptyBlock, SectionElement } from './advancedBlocks';
import { useArtigoXmlViewportScrollLock } from './useArtigoXmlViewportScrollLock';

const SLASH_TRIGGER_TYPES = new Set(['paragraph', 'quote-attrib']);

export { SLASH_TRIGGER_TYPES };

const BLOCK_KIND_ORDER: BlockKind[] = [
  //'paragraph',
  'section',
  //'bulleted-list',
  //'numbered-list',
  'quote',
  'table',
  'figure',
  //'boxed-text',
];

interface SlashTarget {
  path: Path;
  search: string;
}

const detectSlashTarget = (editor: Editor): SlashTarget | null => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) {
    return null;
  }

  const path = selection.anchor.path;
  if (path.length === 0) {
    return null;
  }
  const parentPath = Path.parent(path);

  let parentNode: SlateNode;
  try {
    [parentNode] = Editor.node(editor, parentPath);
  } catch {
    return null;
  }
  if (!SlateElement.isElement(parentNode) || !SLASH_TRIGGER_TYPES.has(parentNode.type)) {
    return null;
  }

  const text = Editor.string(editor, parentPath);
  const match = text.match(/^\/(\S*)$/);
  if (!match) {
    return null;
  }
  return { path: parentPath, search: match[1] };
};

/** Depth a newly-inserted `section` block should use: one deeper than the nearest ancestor section. */
const sectionDepthAt = (editor: Editor, path: Path): number => {
  let depth = 2;
  for (const [node] of Editor.levels(editor, { at: path })) {
    if (SlateElement.isElement(node) && node.type === 'section') {
      depth = Math.max(depth, (node as SectionElement).depth + 1);
    }
  }
  return depth;
};

export interface SlashMenuController {
  isOpen: boolean;
  items: BlockKind[];
  activeIndex: number;
  /** Returns `true` if the key was consumed (caller should not let Slate handle it further). */
  handleKeyDown: (event: React.KeyboardEvent) => boolean;
  selectItem: (kind: BlockKind) => void;
}

export const useSlashMenu = (editor: Editor): SlashMenuController => {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dismissedKey, setDismissedKey] = React.useState<string | null>(null);

  const target = detectSlashTarget(editor);
  const targetKey = target ? `${target.path.join('.')}:${target.search}` : null;

  const items = React.useMemo(() => {
    if (!target) {
      return [];
    }
    const query = target.search.trim().toLowerCase();
    if (!query) {
      return BLOCK_KIND_ORDER;
    }
    return BLOCK_KIND_ORDER.filter((kind) => BLOCK_KIND_LABELS[kind].toLowerCase().includes(query));
  }, [target?.search]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [targetKey]);

  const selectItem = React.useCallback(
    (kind: BlockKind) => {
      if (!target) {
        return;
      }
      const depth = sectionDepthAt(editor, target.path);
      const block = createEmptyBlock(kind, depth);
      Transforms.removeNodes(editor, { at: target.path });
      Transforms.insertNodes(editor, block, { at: target.path });
      Transforms.select(editor, Editor.start(editor, target.path));
      ReactEditor.focus(editor);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, targetKey]
  );

  const isDismissed = targetKey !== null && targetKey === dismissedKey;
  const isOpen = target !== null && items.length > 0 && !isDismissed;

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent): boolean => {
      if (!isOpen) {
        return false;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        selectItem(items[activeIndex]);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissedKey(targetKey);
        return true;
      }
      return false;
    },
    [isOpen, items, activeIndex, selectItem, targetKey]
  );

  return { isOpen, items, activeIndex, handleKeyDown, selectItem };
};

export const SlashMenuList: React.FC<{ controller: SlashMenuController; editor: Editor }> = ({
  controller,
  editor,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);

  useArtigoXmlViewportScrollLock(controller.isOpen, editor);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const updatePosition = () => {
      if (!controller.isOpen || !editor.selection) {
        el.style.display = 'none';
        return;
      }
      try {
        const domRange = ReactEditor.toDOMRange(editor, editor.selection);
        const rect = domRange.getBoundingClientRect();
        el.style.display = 'block';
        el.style.top = `${rect.bottom + 4}px`;
        el.style.left = `${rect.left}px`;
      } catch {
        el.style.display = 'none';
      }
    };

    updatePosition();

    if (!controller.isOpen) {
      return;
    }

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  });

  return (
    <MenuPortal ref={ref} data-slash-menu aria-hidden={!controller.isOpen}>
      {controller.isOpen &&
        controller.items.map((kind, index) => (
          <MenuItem
            key={kind}
            $active={index === controller.activeIndex}
            onMouseDown={(event) => {
              event.preventDefault();
              controller.selectItem(kind);
            }}
          >
            {BLOCK_KIND_LABELS[kind]}
          </MenuItem>
        ))}
    </MenuPortal>
  );
};

const MenuPortal = styled.div`
  position: fixed;
  z-index: 20;
  display: none;
  min-width: 200px;
  max-height: 265px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #dcdce4;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(33, 33, 52, 0.15);
  padding: 4px;
`;

const MenuItem = styled.div<{ $active?: boolean }>`
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 1.4rem;
  cursor: pointer;
  background: ${({ $active }) => ($active ? '#f0f0ff' : 'transparent')};
  color: #32324d;

  &:hover {
    background: #f0f0ff;
  }
`;
