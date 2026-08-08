import * as React from 'react';
import { IconButton } from '@strapi/design-system';
import { Plus, Trash } from '@strapi/icons';
import styled from 'styled-components';

import { BackSection, FootnoteEntry, ReferenceEntry } from '../styles';
import { ADVANCED_EDITOR_SECTION, ADVANCED_EDITOR_SECTION_NAV_OFFSET } from './advancedEditorSections';
import {
  countXrefsToId,
  directChild,
  directChildren,
  ensureChild,
  getElementKey,
  nextFreeId,
  removeElement,
  XrefTarget,
} from './domMutations';
import { InlineRichEditor } from './InlineRichEditor';

interface BackMatterEditorProps {
  doc: Document;
  commit: () => void;
  xrefTargets: XrefTarget[];
}

const textOf = (el: Element | null | undefined): string => el?.textContent?.trim() ?? '';

/**
 * Editable footnotes and references below the advanced body editor, styled like the
 * rendered article so cross-reference navigation lands on the same-looking targets.
 */
export const BackMatterEditor: React.FC<BackMatterEditorProps> = ({ doc, commit, xrefTargets }) => {
  const back = ensureChild(doc.documentElement, 'back');
  const fnGroups = directChildren(back, 'fn-group');
  const notes = fnGroups.flatMap((group) => directChildren(group, 'fn'));
  const refListEl = ensureChild(back, 'ref-list');
  const refs = directChildren(refListEl, 'ref');

  const addNote = () => {
    const group = fnGroups[0] ?? ensureChild(back, 'fn-group');
    const fn = doc.createElement('fn');
    fn.setAttribute('id', nextFreeId(doc, 'fn'));
    fn.setAttribute('fn-type', 'other');
    const label = doc.createElement('label');
    label.textContent = String(directChildren(group, 'fn').length + 1);
    fn.appendChild(label);
    fn.appendChild(doc.createElement('p'));
    group.appendChild(fn);
    commit();
  };

  const addReference = () => {
    const ref = doc.createElement('ref');
    ref.setAttribute('id', nextFreeId(doc, 'B'));
    ref.appendChild(doc.createElement('mixed-citation'));
    refListEl.appendChild(ref);
    commit();
  };

  return (
    <>
      <EditorBackSection data-advanced-editor-section={ADVANCED_EDITOR_SECTION.notes}>
        <h2>Notas</h2>
        {notes.length === 0 && <EmptyHint>Nenhuma nota ainda.</EmptyHint>}
        {notes.map((fn, index) => (
          <EditableNoteRow
            key={getElementKey(fn)}
            fn={fn}
            index={index}
            doc={doc}
            commit={commit}
            xrefTargets={xrefTargets}
          />
        ))}
        <AddButtonRow>
          <AddButton type="button" onClick={addNote}>
            <Plus width="1rem" height="1rem" />
            Adicionar nota
          </AddButton>
        </AddButtonRow>
      </EditorBackSection>

      <EditorBackSection data-advanced-editor-section={ADVANCED_EDITOR_SECTION.references}>
        <h2>{textOf(directChild(refListEl, 'title')) || 'Referências'}</h2>
        {refs.length === 0 && <EmptyHint>Nenhuma referência ainda.</EmptyHint>}
        {refs.map((refEl, index) => (
          <EditableReferenceRow
            key={getElementKey(refEl)}
            refEl={refEl}
            index={index}
            doc={doc}
            commit={commit}
            xrefTargets={xrefTargets}
          />
        ))}
        <AddButtonRow>
          <AddButton type="button" onClick={addReference}>
            <Plus width="1rem" height="1rem" />
            Adicionar referência
          </AddButton>
        </AddButtonRow>
      </EditorBackSection>
    </>
  );
};

const EditableNoteRow: React.FC<{
  fn: Element;
  index: number;
  doc: Document;
  commit: () => void;
  xrefTargets: XrefTarget[];
}> = ({ fn, index, doc, commit, xrefTargets }) => {
  const contentEl = ensureChild(fn, 'p');
  const id = fn.getAttribute('id') || '';

  const handleRemove = () => {
    const refCount = countXrefsToId(doc, id);
    if (refCount > 0) {
      const confirmed = window.confirm(
        `Esta nota é referenciada ${refCount} vez(es) no texto do artigo. Remover mesmo assim? Os links que apontam para ela ("${id}") ficarão quebrados.`
      );
      if (!confirmed) {
        return;
      }
    }
    removeElement(fn);
    commit();
  };

  return (
    <EditableFootnoteEntry id={id || undefined} tabIndex={id ? -1 : undefined}>
      <EntryHeader>
        <EntryMeta>{id}</EntryMeta>
        <IconButton label="Remover nota" onClick={handleRemove}>
          <Trash />
        </IconButton>
      </EntryHeader>
      <InlineRichEditor
        key={getElementKey(contentEl)}
        doc={doc}
        initialNodes={contentEl.childNodes}
        onChange={(nodes) => contentEl.replaceChildren(...nodes)}
        onBlur={commit}
        xrefTargets={xrefTargets}
        fontSize="1.5rem"
        placeholder={`Conteúdo da nota ${index + 1}`}
      />
    </EditableFootnoteEntry>
  );
};

const EditableReferenceRow: React.FC<{
  refEl: Element;
  index: number;
  doc: Document;
  commit: () => void;
  xrefTargets: XrefTarget[];
}> = ({ refEl, index, doc, commit, xrefTargets }) => {
  const mixedEl = ensureChild(refEl, 'mixed-citation');
  const hasElementCitation = Boolean(directChild(refEl, 'element-citation'));
  const id = refEl.getAttribute('id') || `ref-${index}`;

  const handleRemove = () => {
    const refCount = countXrefsToId(doc, id);
    if (refCount > 0) {
      const confirmed = window.confirm(
        `Esta referência é citada ${refCount} vez(es) no texto do artigo. Remover mesmo assim? Os links que apontam para ela ("${id}") ficarão quebrados.`
      );
      if (!confirmed) {
        return;
      }
    }
    removeElement(refEl);
    commit();
  };

  return (
    <EditableReferenceEntry as="div" id={id} tabIndex={-1}>
      <EntryHeader>
        <EntryMeta>
          {id}
          {hasElementCitation ? ' · contém citação estruturada no XML (não editável aqui)' : ''}
        </EntryMeta>
        <IconButton label="Remover referência" onClick={handleRemove}>
          <Trash />
        </IconButton>
      </EntryHeader>
      <InlineRichEditor
        key={getElementKey(mixedEl)}
        doc={doc}
        initialNodes={mixedEl.childNodes}
        onChange={(nodes) => mixedEl.replaceChildren(...nodes)}
        onBlur={commit}
        xrefTargets={xrefTargets}
        fontSize="1.5rem"
        placeholder={`Referência ${index + 1}`}
      />
    </EditableReferenceEntry>
  );
};

const EditorBackSection = styled(BackSection)`
  scroll-margin-top: ${ADVANCED_EDITOR_SECTION_NAV_OFFSET}px;
`;

const AddButtonRow = styled.div`
  margin-top: 0.75em;
`;

const AddButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px dashed #dcdce4;
  border-radius: 4px;
  background: transparent;
  color: #4945ff;
  font-size: 1.125rem;
  font-weight: 600;
  padding: 8px 12px;
  cursor: pointer;

  &:hover {
    background: #f0f0ff;
  }
`;

const EmptyHint = styled.p`
  margin: 0 0 0.5em;
  font-size: 1.5rem;
  color: #666687;
  font-style: italic;
`;

const EntryHeader = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  margin-bottom: 0.5em;
`;

const EntryMeta = styled.span`
  flex: 1;
  font-size: 1.125rem;
  color: #666687;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
`;

const EditableFootnoteEntry = styled(FootnoteEntry)`
  flex-direction: column;
  align-items: stretch;
`;

const EditableReferenceEntry = styled(ReferenceEntry)`
  display: block;
  padding-left: 0;
  text-indent: 0;

  && * {
    text-indent: 0;
  }
`;
