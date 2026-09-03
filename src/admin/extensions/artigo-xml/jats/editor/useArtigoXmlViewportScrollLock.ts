import * as React from 'react';
import { Editor } from 'slate';
import { ReactEditor } from 'slate-react';

import { ARTIGO_XML_VIEWPORT_SELECTOR } from '../../constants';

/** Locks the 70vh XML viewport while a floating overlay (slash menu, formatting toolbar…) is open. */
export const useArtigoXmlViewportScrollLock = (locked: boolean, editor: Editor) => {
  React.useEffect(() => {
    if (!locked) {
      return;
    }

    let anchor: HTMLElement;
    try {
      anchor = ReactEditor.toDOMNode(editor, editor);
    } catch {
      return;
    }

    const container = anchor.closest(ARTIGO_XML_VIEWPORT_SELECTOR);
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const previousOverflow = container.style.overflow;
    const previousOverflowY = container.style.overflowY;
    container.style.overflow = 'hidden';
    container.style.overflowY = 'hidden';

    return () => {
      container.style.overflow = previousOverflow;
      container.style.overflowY = previousOverflowY;
    };
  }, [editor, locked]);
};
