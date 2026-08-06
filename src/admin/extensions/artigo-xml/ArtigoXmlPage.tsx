import * as React from 'react';
import { useParams } from 'react-router-dom';
import {
  Page,
  Layouts,
  useFetchClient,
  useNotification,
  useAPIErrorHandler,
  BackButton,
} from '@strapi/strapi/admin';
import { unstable_useDocumentActions } from '@strapi/content-manager/strapi-admin';
import {
  Box,
  Button,
  Card,
  Divider,
  EmptyStateLayout,
  Field,
  Flex,
  Typography,
} from '@strapi/design-system';
import { Check, Code, Download, Eye, ListPlus, Sparkle, Upload } from '@strapi/icons';

import { ARTIGO_MODEL_UID, getArtigoEditPath } from './constants';
import { buildFileUrl, formatBytes, isXmlFile, type ArtigoXmlFile } from './utils';
import { ArticleRenderer, JatsParseError, parseJatsXml } from './jats/ArticleRenderer';
import { XmlCodeEditor } from './jats/XmlCodeEditor';
import { StructuredEditor } from './jats/editor/StructuredEditor';
import { AdvancedEditor } from './jats/editor/AdvancedEditor';

interface ArtigoData {
  id: number;
  documentId: string;
  titulo: string;
  xml: ArtigoXmlFile | null;
}

export const ArtigoXmlPage = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const { get, post, del } = useFetchClient();
  const { update } = unstable_useDocumentActions();
  const { toggleNotification } = useNotification();
  const { formatAPIError } = useAPIErrorHandler();

  const [artigo, setArtigo] = React.useState<ArtigoData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isContentLoading, setIsContentLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  // `lastSavedXml` mirrors the file currently persisted in Strapi; `draftXml` is the
  // in-progress edit shown by the raw/rendered views. They start out equal and diverge
  // as the user types, which is how the "unsaved changes" UI knows to show up.
  const [lastSavedXml, setLastSavedXml] = React.useState<string | null>(null);
  const [draftXml, setDraftXml] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<'rendered' | 'raw' | 'editor' | 'advanced'>('rendered');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isDirty = draftXml !== null && draftXml !== lastSavedXml;

  const isDraftValid = React.useMemo(() => {
    if (draftXml === null) {
      return false;
    }
    try {
      parseJatsXml(draftXml);
      return true;
    } catch {
      return false;
    }
  }, [draftXml]);

  const fetchArtigo = React.useCallback(async () => {
    if (!documentId) {
      return;
    }

    try {
      setHasError(false);
      const { data } = await get<{ data: ArtigoData }>(
        `/content-manager/collection-types/${ARTIGO_MODEL_UID}/${documentId}`,
        { params: { populate: 'xml' } }
      );

      setArtigo(data.data);
    } catch (error) {
      setHasError(true);
      toggleNotification({
        type: 'danger',
        message: formatAPIError(error as Parameters<typeof formatAPIError>[0]),
      });
    } finally {
      setIsLoading(false);
    }
  }, [documentId, get, toggleNotification, formatAPIError]);

  React.useEffect(() => {
    fetchArtigo();
  }, [fetchArtigo]);

  /**
   * Uploads `file` and links it as the article's `xml` field, replacing whatever was
   * there before (and cleaning up the previous file from the media library). Shared by
   * the "select file" input and by the raw/structured editors' "Salvar" button, which
   * build a `File` out of the in-memory `draftXml` instead of an actual file picked by
   * the user. Returns whether the operation succeeded.
   */
  const replaceXmlFile = React.useCallback(
    async (file: File): Promise<boolean> => {
      if (!documentId) {
        return false;
      }

      const previousFileId = artigo?.xml?.id;

      try {
        const formData = new FormData();
        formData.append('files', file);

        const { data: uploadedFiles } = await post<Array<{ id: number }>>('/upload', formData);
        const uploadedFile = uploadedFiles[0];

        // Uses the Content Manager's own document action so its cache is invalidated,
        // otherwise the article edit view keeps showing the stale xml field on return.
        const result = await update(
          { collectionType: 'collection-types', model: ARTIGO_MODEL_UID, documentId },
          { xml: uploadedFile.id }
        );

        if (result && 'error' in result) {
          return false;
        }

        // The xml field only ever points to a single file, so once the new one is
        // linked, the previous file becomes orphaned and should be removed instead
        // of being left behind as a duplicate in the media library.
        if (previousFileId && previousFileId !== uploadedFile.id) {
          try {
            await del(`/upload/files/${previousFileId}`);
          } catch {
            toggleNotification({
              type: 'warning',
              message:
                'O novo XML foi vinculado, mas o arquivo anterior não pôde ser removido da biblioteca de mídia.',
            });
          }
        }

        return true;
      } catch (error) {
        toggleNotification({
          type: 'danger',
          message: formatAPIError(error as Parameters<typeof formatAPIError>[0]),
        });
        return false;
      }
    },
    [documentId, artigo?.xml?.id, post, update, del, toggleNotification, formatAPIError]
  );

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !documentId) {
      return;
    }

    if (!isXmlFile(file)) {
      toggleNotification({
        type: 'danger',
        message: 'Selecione um arquivo XML válido (.xml).',
      });
      return;
    }

    setIsUploading(true);

    try {
      const succeeded = await replaceXmlFile(file);
      if (succeeded) {
        setLastSavedXml(null);
        setDraftXml(null);
        await fetchArtigo();
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleViewContent = async () => {
    if (!artigo?.xml) {
      return;
    }

    setIsContentLoading(true);

    try {
      const response = await fetch(buildFileUrl(artigo.xml.url));
      const text = await response.text();
      setViewMode('rendered');
      setLastSavedXml(text);
      setDraftXml(text);
      setSaveError(null);
    } catch {
      toggleNotification({
        type: 'danger',
        message: 'Não foi possível carregar o conteúdo do XML.',
      });
    } finally {
      setIsContentLoading(false);
    }
  };

  const handleParseError = React.useCallback(() => {
    setViewMode('raw');
    toggleNotification({
      type: 'warning',
      message: 'Não foi possível interpretar o XML como um artigo; exibindo o conteúdo bruto.',
    });
  }, [toggleNotification]);

  const handleDraftChange = React.useCallback((value: string) => {
    setDraftXml(value);
    setSaveError(null);
  }, []);

  const handleSaveDraft = React.useCallback(async () => {
    if (draftXml === null || !artigo?.xml) {
      return;
    }

    try {
      parseJatsXml(draftXml);
    } catch (error) {
      setSaveError(
        error instanceof JatsParseError
          ? error.message
          : 'Não foi possível validar o XML editado.'
      );
      return;
    }

    setSaveError(null);
    setIsSaving(true);

    try {
      const file = new File([draftXml], artigo.xml.name, { type: 'application/xml' });
      const succeeded = await replaceXmlFile(file);
      if (succeeded) {
        setLastSavedXml(draftXml);
        toggleNotification({ type: 'success', message: 'XML salvo com sucesso.' });
        await fetchArtigo();
      }
    } finally {
      setIsSaving(false);
    }
  }, [draftXml, artigo?.xml, replaceXmlFile, fetchArtigo, toggleNotification]);

  // Best-effort warning so an accidental tab close/navigation doesn't silently
  // discard edits that were never saved.
  React.useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  if (isLoading) {
    return <Page.Loading />;
  }

  if (hasError || !artigo) {
    return <Page.Error />;
  }

  const backPath = documentId ? getArtigoEditPath(documentId) : '/content-manager';

  return (
    <Page.Main>
      <Page.Title>{`Gerenciar XML - ${artigo.titulo}`}</Page.Title>
      <Layouts.Header
        title="Gerenciar XML"
        subtitle={artigo.titulo}
        navigationAction={<BackButton fallback={backPath} />}
      />
      <Layouts.Content>
        <Card padding={6}>
          <Flex direction="column" alignItems="stretch" gap={5}>
            <Box>
              <Typography variant="delta" tag="h2">
                Arquivo XML
              </Typography>
              <Typography variant="pi" textColor="neutral600">
                Visualize ou substitua o arquivo XML associado a este artigo.
              </Typography>
            </Box>

            <Divider />

            {artigo.xml ? (
              <Flex direction="column" alignItems="stretch" gap={4}>
                <Flex justifyContent="space-between" alignItems="center" wrap="wrap" gap={3}>
                  <Flex direction="column" alignItems="flex-start" gap={1}>
                    <Typography fontWeight="semiBold">
                      {artigo.xml.name}
                      {isDirty && ' *'}
                    </Typography>
                    <Typography variant="pi" textColor="neutral600">
                      {formatBytes(artigo.xml.size * 1000)}
                      {artigo.xml.updatedAt
                        ? ` · Atualizado em ${new Date(artigo.xml.updatedAt).toLocaleString('pt-BR')}`
                        : ''}
                      {isDirty ? ' · Alterações não salvas' : ''}
                    </Typography>
                  </Flex>
                  <Flex gap={2}>
                    {draftXml !== null && isDirty && (
                      <Button
                        variant="success"
                        startIcon={<Check />}
                        loading={isSaving}
                        onClick={handleSaveDraft}
                      >
                        Salvar alterações
                      </Button>
                    )}
                    <Button
                      variant="tertiary"
                      startIcon={<Eye />}
                      loading={isContentLoading}
                      onClick={handleViewContent}
                    >
                      Visualizar artigo
                    </Button>
                    <Button
                      variant="secondary"
                      startIcon={<Download />}
                      tag="a"
                      href={buildFileUrl(artigo.xml.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Baixar
                    </Button>
                  </Flex>
                </Flex>

                {saveError && (
                  <Box background="danger100" hasRadius borderColor="danger200" padding={3}>
                    <Typography textColor="danger600">{saveError}</Typography>
                  </Box>
                )}

                {draftXml !== null && (
                  <Flex direction="column" alignItems="stretch" gap={3}>
                    <Flex gap={2}>
                      <Button
                        size="S"
                        variant={viewMode === 'rendered' ? 'secondary' : 'ghost'}
                        startIcon={<Eye />}
                        onClick={() => setViewMode('rendered')}
                      >
                        Artigo renderizado
                      </Button>
                      <Button
                        size="S"
                        variant={viewMode === 'raw' ? 'secondary' : 'ghost'}
                        startIcon={<Code />}
                        onClick={() => setViewMode('raw')}
                      >
                        XML bruto
                      </Button>
                      <Button
                        size="S"
                        variant={viewMode === 'editor' ? 'secondary' : 'ghost'}
                        startIcon={<ListPlus />}
                        onClick={() => setViewMode('editor')}
                      >
                        Editor estruturado
                      </Button>
                      <Button
                        size="S"
                        variant={viewMode === 'advanced' ? 'secondary' : 'ghost'}
                        startIcon={<Sparkle />}
                        onClick={() => setViewMode('advanced')}
                      >
                        Editor avançado
                      </Button>
                    </Flex>

                    {(viewMode === 'editor' || viewMode === 'advanced') && !isDraftValid ? (
                      <Box background="neutral0" hasRadius borderColor="neutral200" padding={6}>
                        <Typography>
                          O XML atual não pôde ser interpretado como um artigo, então o editor
                          {viewMode === 'advanced' ? ' avançado' : ' estruturado'} não pode ser
                          exibido. Corrija-o na aba "XML bruto" primeiro.
                        </Typography>
                      </Box>
                    ) : (
                      <Box
                        background="neutral0"
                        hasRadius
                        borderColor="neutral200"
                        padding={viewMode === 'raw' ? 0 : 6}
                        // The raw editor (CodeMirror) manages its own internal scrolling at a
                        // fixed height, so this wrapper must not also scroll — doing both
                        // produced a barely-there outer scrollbar alongside the real one.
                        // `hidden` (rather than no overflow rule) still clips CodeMirror's
                        // corners to the rounded border without adding a second scrollbar.
                        maxHeight={viewMode === 'raw' ? undefined : '70vh'}
                        overflow={viewMode === 'raw' ? 'hidden' : 'auto'}
                      >
                        {viewMode === 'rendered' && (
                          <ArticleRenderer xml={draftXml} onParseError={handleParseError} />
                        )}
                        {viewMode === 'raw' && (
                          <XmlCodeEditor value={draftXml} onChange={handleDraftChange} />
                        )}
                        {viewMode === 'editor' && (
                          <StructuredEditor xml={draftXml} onChange={handleDraftChange} />
                        )}
                        {viewMode === 'advanced' && (
                          <AdvancedEditor xml={draftXml} onChange={handleDraftChange} />
                        )}
                      </Box>
                    )}
                  </Flex>
                )}
              </Flex>
            ) : (
              <EmptyStateLayout content="Este artigo ainda não possui um arquivo XML." />
            )}

            <Divider />

            <Field.Root hint="Apenas arquivos .xml são aceitos.">
              <Field.Label>{artigo.xml ? 'Substituir arquivo XML' : 'Enviar arquivo XML'}</Field.Label>
              <Flex gap={2}>
                <Button
                  variant="default"
                  startIcon={<Upload />}
                  loading={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Selecionar arquivo
                </Button>
              </Flex>
              <Field.Hint />
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </Field.Root>
          </Flex>
        </Card>
      </Layouts.Content>
    </Page.Main>
  );
};
