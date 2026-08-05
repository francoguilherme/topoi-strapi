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
import { Code, Download, Eye, Upload } from '@strapi/icons';

import { ARTIGO_MODEL_UID, getArtigoEditPath } from './constants';
import { buildFileUrl, formatBytes, isXmlFile, type ArtigoXmlFile } from './utils';
import { ArticleRenderer } from './jats/ArticleRenderer';

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
  const [xmlContent, setXmlContent] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<'rendered' | 'raw'>('rendered');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

    const previousFileId = artigo?.xml?.id;

    setIsUploading(true);

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
        return;
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

      setXmlContent(null);
      await fetchArtigo();
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: formatAPIError(error as Parameters<typeof formatAPIError>[0]),
      });
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
      setXmlContent(text);
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
                    <Typography fontWeight="semiBold">{artigo.xml.name}</Typography>
                    <Typography variant="pi" textColor="neutral600">
                      {formatBytes(artigo.xml.size * 1000)}
                      {artigo.xml.updatedAt
                        ? ` · Atualizado em ${new Date(artigo.xml.updatedAt).toLocaleString('pt-BR')}`
                        : ''}
                    </Typography>
                  </Flex>
                  <Flex gap={2}>
                    {xmlContent !== null && (
                      <Button
                        variant="tertiary"
                        startIcon={viewMode === 'rendered' ? <Code /> : <Eye />}
                        onClick={() => setViewMode(viewMode === 'rendered' ? 'raw' : 'rendered')}
                      >
                        {viewMode === 'rendered' ? 'Ver XML bruto' : 'Ver artigo renderizado'}
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

                {xmlContent !== null && (
                  <Box
                    background="neutral0"
                    hasRadius
                    borderColor="neutral200"
                    padding={6}
                    maxHeight="70vh"
                    overflow="auto"
                  >
                    {viewMode === 'rendered' ? (
                      <ArticleRenderer xml={xmlContent} onParseError={handleParseError} />
                    ) : (
                      <Typography tag="pre" variant="pi" style={{ whiteSpace: 'pre-wrap' }}>
                        {xmlContent}
                      </Typography>
                    )}
                  </Box>
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
