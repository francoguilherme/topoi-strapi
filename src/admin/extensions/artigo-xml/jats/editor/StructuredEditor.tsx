import * as React from 'react';
import { Flex } from '@strapi/design-system';

import { BodyFields } from './BodyFields';
import { listXrefTargets } from './domMutations';
import { MetadataFields } from './MetadataFields';
import { NotesFields } from './NotesFields';
import { ReferencesFields } from './ReferencesFields';
import { useArticleDocument } from './useArticleDocument';

interface StructuredEditorProps {
  xml: string;
  onChange: (xml: string) => void;
}

/**
 * Field-based editor for the article, assembled from the front-matter, body, notes and
 * references sub-forms. All of them share a single live `Document` (via
 * `useArticleDocument`) so edits made in one section are immediately reflected in the
 * others, in the raw XML tab and in the rendered preview.
 */
export const StructuredEditor: React.FC<StructuredEditorProps> = ({ xml, onChange }) => {
  const { doc, commit } = useArticleDocument(xml, onChange);
  // `doc` is mutated in place (its identity never changes), so this must be recomputed on
  // every render rather than memoized on `doc` — otherwise newly added/removed notes and
  // references would never show up in (or disappear from) the cross-reference picker.
  const xrefTargets = listXrefTargets(doc);

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      {/* <MetadataFields doc={doc} commit={commit} /> */}
      <BodyFields doc={doc} commit={commit} xrefTargets={xrefTargets} />
      <NotesFields doc={doc} commit={commit} xrefTargets={xrefTargets} />
      <ReferencesFields doc={doc} commit={commit} xrefTargets={xrefTargets} />
    </Flex>
  );
};
