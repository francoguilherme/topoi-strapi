import * as React from 'react';
import { Button, Field, Flex, Modal, TextInput, Typography } from '@strapi/design-system';
import { useSlate } from 'slate-react';

import { insertLink, LinkElement, updateLink } from './inlineModel';
import { LinkDialogContext, LinkDialogTarget } from './linkDialogContext';

export { useLinkDialog } from './linkDialogContext';

/** Returns a normalized http(s) URL, prefixing `https://` when no protocol is given. */
export const normalizeExternalUrl = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
};

type DialogMode = 'insert' | 'edit';

interface DialogState {
  mode: DialogMode;
  element?: LinkElement;
}

export const LinkDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const editor = useSlate();
  const [state, setState] = React.useState<DialogState | null>(null);
  const [href, setHref] = React.useState('');
  const [showError, setShowError] = React.useState(false);

  const normalizedHref = normalizeExternalUrl(href);
  const isValid = normalizedHref !== null;

  const closeDialog = React.useCallback(() => {
    setState(null);
    setHref('');
    setShowError(false);
  }, []);

  const openInsertDialog = React.useCallback(() => {
    if (!editor.selection) {
      return;
    }
    setHref('');
    setShowError(false);
    setState({ mode: 'insert' });
  }, [editor]);

  const openEditDialog = React.useCallback((element: LinkDialogTarget) => {
    setHref(element.href);
    setShowError(false);
    setState({ mode: 'edit', element: element as LinkElement });
  }, []);

  const handleConfirm = () => {
    const normalized = normalizeExternalUrl(href);
    if (!normalized) {
      setShowError(true);
      return;
    }

    if (state?.mode === 'insert') {
      insertLink(editor, normalized);
    } else if (state?.mode === 'edit' && state.element) {
      updateLink(editor, state.element, normalized);
    }

    closeDialog();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeDialog();
    }
  };

  const contextValue = React.useMemo(
    () => ({ openInsertDialog, openEditDialog }),
    [openInsertDialog, openEditDialog]
  );

  return (
    <LinkDialogContext.Provider value={contextValue}>
      {children}
      {state && (
        <Modal.Root open onOpenChange={handleOpenChange}>
          <Modal.Content>
            <Modal.Header>
              <Modal.Title>{state.mode === 'insert' ? 'Inserir link' : 'Editar link'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Field.Root error={showError && !isValid ? 'Informe uma URL válida' : undefined}>
                <Field.Label>URL</Field.Label>
                <TextInput
                  aria-label="URL do link"
                  name="link-url"
                  placeholder="exemplo.com ou https://exemplo.com"
                  value={href}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setHref(event.target.value);
                    if (showError) {
                      setShowError(false);
                    }
                  }}
                  onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleConfirm();
                    }
                  }}
                />
                {!showError && normalizedHref && normalizedHref !== href.trim() && (
                  <Typography variant="pi" textColor="neutral600">
                    Será salvo como {normalizedHref}
                  </Typography>
                )}
                {showError && !isValid && (
                  <Typography variant="pi" textColor="danger600">
                    Informe uma URL válida
                  </Typography>
                )}
              </Field.Root>
            </Modal.Body>
            <Modal.Footer>
              <Flex justifyContent="flex-end" gap={2}>
                <Modal.Close>
                  <Button variant="tertiary">Cancelar</Button>
                </Modal.Close>
                <Button onClick={handleConfirm} disabled={!isValid}>
                  {state.mode === 'insert' ? 'Inserir' : 'Salvar'}
                </Button>
              </Flex>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      )}
    </LinkDialogContext.Provider>
  );
};
