import * as React from 'react';
import { Flex, Typography } from '@strapi/design-system';

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
import { AddButton, FieldGroup, ItemCard, ItemToolbar } from './fieldUi';

interface FieldsProps {
  doc: Document;
  commit: () => void;
  xrefTargets: XrefTarget[];
}

/**
 * List of bibliographic references (`<ref>`). Only `<mixed-citation>` — the free-text
 * rendering of the citation — is editable here, matching how `ArticleRenderer` treats
 * it as the source of truth; any `<element-citation>` (structured author/title/source/
 * year data) is preserved untouched. Removing a reference warns first if any `<xref
 * rid="...">` in the body still points at it.
 */
export const ReferencesFields: React.FC<FieldsProps> = ({ doc, commit, xrefTargets }) => {
  const back = ensureChild(doc.documentElement, 'back');
  const refList = ensureChild(back, 'ref-list');
  const refs = directChildren(refList, 'ref');

  const addReference = () => {
    const ref = doc.createElement('ref');
    ref.setAttribute('id', nextFreeId(doc, 'B'));
    ref.appendChild(doc.createElement('mixed-citation'));
    refList.appendChild(ref);
    commit();
  };

  return (
    <FieldGroup
      title="Referências"
      hint="Edita a citação em texto (mixed-citation); dados estruturados (element-citation), quando existentes, são preservados como estão."
    >
      <Flex direction="column" alignItems="stretch" gap={2}>
        {refs.map((refEl) => (
          <ReferenceRow key={getElementKey(refEl)} refEl={refEl} doc={doc} commit={commit} xrefTargets={xrefTargets} />
        ))}
      </Flex>
      <AddButton label="Adicionar referência" onClick={addReference} />
    </FieldGroup>
  );
};

const ReferenceRow: React.FC<{ refEl: Element; doc: Document; commit: () => void; xrefTargets: XrefTarget[] }> = ({
  refEl,
  doc,
  commit,
  xrefTargets,
}) => {
  const mixedEl = ensureChild(refEl, 'mixed-citation');
  const hasElementCitation = Boolean(directChild(refEl, 'element-citation'));
  const id = refEl.getAttribute('id') || '';

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
    <ItemCard>
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Flex justifyContent="space-between" alignItems="flex-start">
          <Typography variant="pi" textColor="neutral600">
            id: {id}
            {hasElementCitation ? ' · possui dados estruturados (element-citation) preservados' : ''}
          </Typography>
          <ItemToolbar onRemove={handleRemove} removeLabel="Remover referência" />
        </Flex>
        <InlineRichEditor
          key={getElementKey(mixedEl)}
          doc={doc}
          initialNodes={mixedEl.childNodes}
          onChange={(nodes) => mixedEl.replaceChildren(...nodes)}
          onBlur={commit}
          xrefTargets={xrefTargets}
        />
      </Flex>
    </ItemCard>
  );
};
