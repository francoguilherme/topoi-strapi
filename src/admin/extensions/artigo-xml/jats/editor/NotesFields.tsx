import * as React from 'react';
import { Box, Flex, Typography } from '@strapi/design-system';

import {
  countXrefsToId,
  directChildren,
  ensureChild,
  getElementKey,
  nextFreeId,
  removeElement,
  setPlainText,
  XrefTarget,
} from './domMutations';
import { InlineRichEditor } from './InlineRichEditor';
import { AddButton, FieldGroup, ItemCard, ItemToolbar, LabeledInput } from './fieldUi';

interface FieldsProps {
  doc: Document;
  commit: () => void;
  xrefTargets: XrefTarget[];
}

/**
 * List of footnotes (`<fn>`, grouped under one or more `<fn-group>`). New notes get the
 * next free `fnN` id; removing one first counts how many `<xref rid="...">` in the body
 * point at it and asks for confirmation if there are any, since those links would
 * otherwise silently break.
 */
export const NotesFields: React.FC<FieldsProps> = ({ doc, commit, xrefTargets }) => {
  const back = ensureChild(doc.documentElement, 'back');
  const fnGroups = directChildren(back, 'fn-group');
  const notes = fnGroups.flatMap((group) => directChildren(group, 'fn'));

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

  return (
    <FieldGroup title="Notas de rodapé" hint="Notas referenciadas no corpo do texto por xref.">
      <Flex direction="column" alignItems="stretch" gap={2}>
        {notes.map((fn) => (
          <NoteRow key={getElementKey(fn)} fn={fn} doc={doc} commit={commit} xrefTargets={xrefTargets} />
        ))}
      </Flex>
      <AddButton label="Adicionar nota" onClick={addNote} />
    </FieldGroup>
  );
};

const NoteRow: React.FC<{ fn: Element; doc: Document; commit: () => void; xrefTargets: XrefTarget[] }> = ({
  fn,
  doc,
  commit,
  xrefTargets,
}) => {
  const labelEl = ensureChild(fn, 'label');
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
    <ItemCard>
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Flex justifyContent="space-between" alignItems="flex-start">
          <Flex gap={3} alignItems="center">
            <Typography variant="pi" textColor="neutral600">
              id: {id}
            </Typography>
            <Box width="70px">
              <LabeledInput
                label="Rótulo"
                value={labelEl.textContent || ''}
                onChange={(value) => setPlainText(labelEl, value)}
                onBlur={commit}
              />
            </Box>
          </Flex>
          <ItemToolbar onRemove={handleRemove} removeLabel="Remover nota" />
        </Flex>
        <InlineRichEditor
          key={getElementKey(contentEl)}
          doc={doc}
          initialNodes={contentEl.childNodes}
          onChange={(nodes) => contentEl.replaceChildren(...nodes)}
          onBlur={commit}
          xrefTargets={xrefTargets}
        />
      </Flex>
    </ItemCard>
  );
};
