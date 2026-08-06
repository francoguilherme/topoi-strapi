import * as React from 'react';

import { parseJatsXml } from '../ArticleRenderer';
import { extractXmlHeader, serializeArticle } from './domMutations';

/**
 * Bridges the structured field editors with the shared `draftXml` string used by the
 * raw editor and the live preview. Keeps a single live `Document` (mutated directly by
 * the field editors) and only re-parses it when `xml` changes for a reason other than
 * this hook's own `commit()` calls — e.g. the user edited the raw XML tab, or loaded a
 * different article — so in-progress edits never get discarded by an unrelated render.
 */
export const useArticleDocument = (xml: string, onChange: (xml: string) => void) => {
  const stateRef = React.useRef<{ doc: Document; header: string; lastEmitted: string }>();

  if (!stateRef.current || stateRef.current.lastEmitted !== xml) {
    try {
      stateRef.current = {
        doc: parseJatsXml(xml),
        header: extractXmlHeader(xml),
        lastEmitted: xml,
      };
    } catch (error) {
      // Keeps editing the last valid doc if the incoming `xml` is momentarily broken
      // (e.g. mid-edit in the raw tab); with no valid doc yet, there's nothing to fall
      // back to, so the error propagates for the caller to handle.
      if (!stateRef.current) {
        throw error;
      }
      stateRef.current = { ...stateRef.current, lastEmitted: xml };
    }
  }

  const commit = React.useCallback(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    const serialized = serializeArticle(state.doc, state.header);
    state.lastEmitted = serialized;
    onChange(serialized);
  }, [onChange]);

  return { doc: stateRef.current.doc, commit };
};
