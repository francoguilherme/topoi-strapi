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
import { Check, Code, Download, Eye, Images, ListPlus, Sparkle, Upload } from '@strapi/icons';

import { ARTIGO_MODEL_UID, getArtigoEditPath, JATS_XML_FILENAME } from './constants';
import { ArtigoXmlNavigationContext } from './ArtigoXmlNavigationContext';
import { FigureAssetsProvider } from './FigureAssetsContext';
import {
  advancedEditorSectionSelector,
  ADVANCED_EDITOR_SECTION_NAV_OFFSET,
  type AdvancedEditorSection,
} from './jats/editor/advancedEditorSections';
import { AdvancedEditorSectionNav } from './jats/editor/AdvancedEditorSectionNav';
import { buildFileUrl, formatBytes, formatConverterUserMessage, formatGenerationStatus, isXmlFile, type ArtigoXmlFile } from './utils';
import { ArticleRenderer, JatsParseError, parseJatsXml } from './jats/ArticleRenderer';
import {
  buildImageMap,
  extractGraphicHrefs,
  hrefBasename,
  matchFolderFiles,
} from './jats/figureAssets';
import { normalizeJatsXml } from './jats/normalizeJatsXml';
import { XmlCodeEditor } from './jats/XmlCodeEditor';
import { StructuredEditor } from './jats/editor/StructuredEditor';
import { AdvancedEditor } from './jats/editor/AdvancedEditor';

interface ArtigoData {
  id: number;
  documentId: string;
  titulo: string;
  xml: ArtigoXmlFile | null;
  imagens: ArtigoXmlFile[] | null;
  arquivo?: ArtigoXmlFile | null;
}

interface GenerationStatus {
  status: string;
  error?: string | null;
  log_tail?: string;
}

export const ArtigoXmlPage = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const { get, post } = useFetchClient();
  const { update } = unstable_useDocumentActions();
  const { toggleNotification } = useNotification();
  const { formatAPIError } = useAPIErrorHandler();

  const formatConverterError = React.useCallback(
    (error: Parameters<typeof formatAPIError>[0]) =>
      formatConverterUserMessage(formatAPIError(error)),
    [formatAPIError]
  );

  const [artigo, setArtigo] = React.useState<ArtigoData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isUploadingImages, setIsUploadingImages] = React.useState(false);
  const [isOrganizing, setIsOrganizing] = React.useState(false);
  const [isDownloadingPackage, setIsDownloadingPackage] = React.useState(false);
  const [isContentLoading, setIsContentLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [generationJobId, setGenerationJobId] = React.useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = React.useState<GenerationStatus | null>(null);
  // `lastSavedXml` mirrors the file currently persisted in Strapi; `draftXml` is the
  // in-progress edit shown by the raw/rendered views. They start out equal and diverge
  // as the user types, which is how the "unsaved changes" UI knows to show up.
  const [lastSavedXml, setLastSavedXml] = React.useState<string | null>(null);
  const [draftXml, setDraftXml] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<'rendered' | 'raw' | 'editor' | 'advanced'>('rendered');
  const [editorRevision, setEditorRevision] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imagesInputRef = React.useRef<HTMLInputElement>(null);
  const loadedXmlIdRef = React.useRef<number | null>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const viewportScrollTopRef = React.useRef(0);

  const changeViewMode = React.useCallback((mode: typeof viewMode) => {
    if (viewportRef.current) {
      viewportScrollTopRef.current = viewportRef.current.scrollTop;
    }
    setViewMode(mode);
  }, []);

  const scrollToRid = React.useCallback((rid: string) => {
    const viewport = viewportRef.current;
    if (!viewport || !rid) {
      return;
    }

    const selector = `#${CSS.escape(rid)}`;
    const target = Array.from(viewport.querySelectorAll(selector)).find(
      (el) => (el as HTMLElement).getClientRects().length > 0
    );

    if (!target) {
      return;
    }

    const targetEl = target as HTMLElement;
    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const top =
      viewport.scrollTop +
      (targetRect.top - viewportRect.top) -
      viewport.clientHeight / 2 +
      targetRect.height / 2;

    viewport.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    targetEl.focus({ preventScroll: true });
  }, []);

  const scrollToSection = React.useCallback((section: AdvancedEditorSection) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const target = viewport.querySelector(advancedEditorSectionSelector(section));
    if (!target || (target as HTMLElement).getClientRects().length === 0) {
      return;
    }

    const targetEl = target as HTMLElement;
    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const navOffset = ADVANCED_EDITOR_SECTION_NAV_OFFSET;
    const top = viewport.scrollTop + (targetRect.top - viewportRect.top) - navOffset;

    viewport.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);

  const navigation = React.useMemo(
    () => ({ scrollToRid, scrollToSection }),
    [scrollToRid, scrollToSection]
  );

  React.useLayoutEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportScrollTopRef.current;
    }
  }, [viewMode]);

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

  // Figuras do XML atual e o que já existe na biblioteca para cada uma. O XML
  // guarda o caminho portátil do pacote SciELO; a correspondência com os
  // arquivos enviados é feita pelo nome.
  const graphicHrefs = React.useMemo(
    () => (draftXml === null ? [] : extractGraphicHrefs(draftXml)),
    [draftXml]
  );

  const imageMap = React.useMemo(() => buildImageMap(artigo?.imagens), [artigo?.imagens]);

  const missingHrefs = React.useMemo(
    () => graphicHrefs.filter((href) => !imageMap.has(hrefBasename(href).toLowerCase())),
    [graphicHrefs, imageMap]
  );

  const fetchArtigo = React.useCallback(async () => {
    if (!documentId) {
      return;
    }

    try {
      setHasError(false);
      const { data } = await get<{ data: ArtigoData }>(
        `/content-manager/collection-types/${ARTIGO_MODEL_UID}/${documentId}`,
        { params: { populate: ['xml', 'imagens', 'arquivo'] } }
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

  React.useEffect(() => {
    if (!generationJobId || !documentId) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const { data } = await get<{ data: GenerationStatus }>(
          `/artigo-xml/${documentId}/gerar/${generationJobId}`
        );
        if (cancelled) {
          return;
        }

        const payload = data.data;
        setGenerationStatus(payload);

        if (payload.status === 'concluido') {
          setGenerationJobId(null);
          await fetchArtigo();
          toggleNotification({ type: 'success', message: 'XML gerado com sucesso.' });
          return;
        }

        if (payload.status === 'failed') {
          setGenerationJobId(null);
          toggleNotification({
            type: 'danger',
            message: payload.error || 'Falha ao gerar o XML.',
          });
          return;
        }

        timeoutId = setTimeout(poll, 10000);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setGenerationJobId(null);
        setGenerationStatus({
          status: 'failed',
          error: formatConverterError(error as Parameters<typeof formatAPIError>[0]),
        });
        toggleNotification({
          type: 'danger',
          message: formatConverterError(error as Parameters<typeof formatAPIError>[0]),
        });
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [generationJobId, documentId, get, fetchArtigo, toggleNotification, formatConverterError]);

  const loadXmlContent = React.useCallback(
    async (xmlFile: ArtigoXmlFile) => {
      setIsContentLoading(true);

      try {
        const response = await fetch(buildFileUrl(xmlFile.url));
        const text = await response.text();
        let content = text;
        try {
          content = normalizeJatsXml(text);
        } catch {
          toggleNotification({
            type: 'warning',
            message: 'O XML foi carregado, mas não pôde ser formatado automaticamente.',
          });
        }
        setViewMode('rendered');
        setLastSavedXml(content);
        setDraftXml(content);
        setSaveError(null);
      } catch {
        toggleNotification({
          type: 'danger',
          message: 'Não foi possível carregar o conteúdo do XML.',
        });
      } finally {
        setIsContentLoading(false);
      }
    },
    [toggleNotification]
  );

  React.useEffect(() => {
    if (!artigo?.xml) {
      loadedXmlIdRef.current = null;
      setLastSavedXml(null);
      setDraftXml(null);
      return;
    }

    if (loadedXmlIdRef.current === artigo.xml.id) {
      return;
    }

    loadedXmlIdRef.current = artigo.xml.id;
    loadXmlContent(artigo.xml);
  }, [artigo?.xml, loadXmlContent]);

  /**
   * Uploads `file` into the article's `xml/{documentId}/` media folder and links it as
   * the `xml` field, replacing (and deleting) whatever was there before. Shared by the
   * "select file" input and by the raw/structured editors' "Salvar" button, which build
   * a `File` out of the in-memory `draftXml` instead of an actual file picked by the
   * user. Returns whether the operation succeeded.
   */
  const replaceXmlFile = React.useCallback(
    async (file: File): Promise<boolean> => {
      if (!documentId) {
        return false;
      }

      try {
        const payload =
          file.name === JATS_XML_FILENAME
            ? file
            : new File([file], JATS_XML_FILENAME, { type: file.type || 'application/xml' });

        const formData = new FormData();
        formData.append('files', payload, JATS_XML_FILENAME);
        formData.append('fileName', JATS_XML_FILENAME);

        const { data } = await post<{ data: { xml: { id: number } } }>(
          `/artigo-xml/${documentId}/xml`,
          formData
        );

        // The endpoint already linked the file; replaying the same link through the
        // Content Manager action is what invalidates its cache, otherwise the article
        // edit view keeps showing the stale xml field on return.
        await update(
          { collectionType: 'collection-types', model: ARTIGO_MODEL_UID, documentId },
          { xml: data.data.xml.id }
        );

        return true;
      } catch (error) {
        toggleNotification({
          type: 'danger',
          message: formatAPIError(error as Parameters<typeof formatAPIError>[0]),
        });
        return false;
      }
    },
    [documentId, post, update, toggleNotification, formatAPIError]
  );

  const notifyImageUploadResult = React.useCallback(
    (matchedCount: number, missing: string[]) => {
      if (matchedCount === 0) {
        return;
      }

      if (missing.length > 0) {
        toggleNotification({
          type: 'warning',
          message: `${matchedCount} imagem(ns) enviada(s). Ainda faltam ${missing.length}: ${missing
            .slice(0, 3)
            .join(', ')}${missing.length > 3 ? '…' : ''}`,
        });
      } else {
        toggleNotification({
          type: 'success',
          message: `${matchedCount} imagem(ns) enviada(s) com sucesso.`,
        });
      }
    },
    [toggleNotification]
  );

  const uploadMatchedImages = React.useCallback(
    async (
      hrefs: string[],
      matched: Array<{ href: string; file: File }>
    ): Promise<{ missing: string[] } | null> => {
      if (!documentId || matched.length === 0) {
        return null;
      }

      const formData = new FormData();
      matched.forEach(({ href, file }) => {
        formData.append('files', file, hrefBasename(href));
      });
      formData.append('hrefs', JSON.stringify(hrefs));

      try {
        const { data } = await post<{ data: { imagens: ArtigoXmlFile[] } }>(
          `/artigo-xml/${documentId}/imagens`,
          formData
        );
        const imageMap = buildImageMap(data.data.imagens);
        const missing = hrefs.filter(
          (href) => !imageMap.has(hrefBasename(href).toLowerCase())
        );
        return { missing };
      } catch (error) {
        toggleNotification({
          type: 'danger',
          message: formatAPIError(error as Parameters<typeof formatAPIError>[0]),
        });
        return null;
      }
    },
    [documentId, post, toggleNotification, formatAPIError]
  );

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0 || !documentId) {
      return;
    }

    const xmlFiles = files.filter(isXmlFile);
    if (xmlFiles.length === 0) {
      toggleNotification({
        type: 'danger',
        message: 'Selecione pelo menos um arquivo XML (.xml).',
      });
      return;
    }

    if (xmlFiles.length > 1) {
      toggleNotification({
        type: 'danger',
        message: 'Selecione apenas um arquivo XML por vez.',
      });
      return;
    }

    const xmlFile = xmlFiles[0];
    const companionFiles = files.filter((file) => file !== xmlFile);

    setIsUploading(true);

    try {
      let normalizedXml: string;
      try {
        normalizedXml = normalizeJatsXml(await xmlFile.text());
      } catch {
        toggleNotification({
          type: 'danger',
          message:
            'Não foi possível normalizar o XML. Verifique se o arquivo é um artigo JATS válido e bem formado.',
        });
        return;
      }

      const hrefs = extractGraphicHrefs(normalizedXml);
      const { matched, missing } = matchFolderFiles(hrefs, companionFiles);

      // When the article already has an XML, load the new file into the draft
      // so the user can review it before explicitly saving.
      if (artigo?.xml) {
        setViewMode('rendered');
        setDraftXml(normalizedXml);
        setSaveError(null);
        setEditorRevision((revision) => revision + 1);

        if (matched.length > 0) {
          const result = await uploadMatchedImages(hrefs, matched);
          if (result) {
            await fetchArtigo();
            notifyImageUploadResult(matched.length, result.missing);
          }
        } else if (hrefs.length > 0 && companionFiles.length > 0) {
          toggleNotification({
            type: 'warning',
            message:
              'Nenhuma das imagens selecionadas corresponde às figuras referenciadas pelo XML.',
          });
        }

        return;
      }

      const normalizedFile = new File([normalizedXml], JATS_XML_FILENAME, {
        type: xmlFile.type || 'application/xml',
      });
      const succeeded = await replaceXmlFile(normalizedFile);
      if (!succeeded) {
        return;
      }

      setLastSavedXml(null);
      setDraftXml(null);
      await fetchArtigo();

      if (matched.length > 0) {
        const result = await uploadMatchedImages(hrefs, matched);
        if (result) {
          await fetchArtigo();
          notifyImageUploadResult(matched.length, result.missing);
        }
      } else if (hrefs.length > 0 && companionFiles.length > 0) {
        toggleNotification({
          type: 'warning',
          message:
            'O XML foi enviado, mas nenhuma das imagens selecionadas corresponde às figuras referenciadas.',
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Takes the files the user picked, keeps only the images the XML actually
   * references and uploads them into `xml/{documentId}/`.
   */
  const handleImagesFilesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0 || !documentId) {
      return;
    }

    const { matched } = matchFolderFiles(graphicHrefs, files);

    if (matched.length === 0) {
      toggleNotification({
        type: 'danger',
        message: 'Nenhuma das imagens referenciadas pelo XML foi encontrada nos arquivos selecionados.',
      });
      return;
    }

    setIsUploadingImages(true);

    try {
      const result = await uploadMatchedImages(graphicHrefs, matched);
      if (result) {
        await fetchArtigo();
        notifyImageUploadResult(matched.length, result.missing);
      }
    } finally {
      setIsUploadingImages(false);
    }
  };

  /** Moves files linked outside this flow (typically the PDF) into the article folder. */
  const handleOrganizar = async () => {
    if (!documentId) {
      return;
    }

    setIsOrganizing(true);

    try {
      const { data } = await post<{ data: { movidos: string[]; falhas: string[] } }>(
        `/artigo-xml/${documentId}/organizar`
      );

      const { movidos, falhas } = data.data;

      toggleNotification({
        type: falhas.length > 0 ? 'warning' : 'success',
        message:
          falhas.length > 0
            ? `${movidos.length} arquivo(s) organizados; ${falhas.length} falharam.`
            : `${movidos.length} arquivo(s) organizados em xml/${documentId}.`,
      });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: formatAPIError(error as Parameters<typeof formatAPIError>[0]),
      });
    } finally {
      setIsOrganizing(false);
    }
  };

  /**
   * Downloads the article package. Goes through the fetch client (instead of a
   * plain link) because the endpoint is admin-authenticated.
   */
  const handleDownloadPackage = async () => {
    if (!documentId) {
      return;
    }

    setIsDownloadingPackage(true);

    try {
      const { data, headers } = await get(`/artigo-xml/${documentId}/pacote`, {
        responseType: 'blob',
      });

      const suggestedName = headers
        ?.get('content-disposition')
        ?.match(/filename="([^"]+)"/i)?.[1];

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = suggestedName || `${documentId}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: formatAPIError(error as Parameters<typeof formatAPIError>[0]),
      });
    } finally {
      setIsDownloadingPackage(false);
    }
  };

  const handleGenerateXml = async () => {
    if (!documentId || !artigo) {
      return;
    }

    if (!artigo.arquivo) {
      toggleNotification({
        type: 'danger',
        message: 'Este artigo não possui um PDF em "arquivo" para converter.',
      });
      return;
    }

    if (isDirty) {
      const confirmed = window.confirm(
        'Há alterações não salvas no XML. Gerar um novo XML vai descartá-las. Continuar?'
      );
      if (!confirmed) {
        return;
      }
    } else if (artigo.xml) {
      const confirmed = window.confirm(
        'Este artigo já possui um XML. Gerar um novo vai substituí-lo. Continuar?'
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      const { data } = await post<{ data: { jobId: string; status: string } }>(
        `/artigo-xml/${documentId}/gerar`
      );
      setGenerationJobId(data.data.jobId);
      setGenerationStatus({ status: data.data.status });
      toggleNotification({
        type: 'info',
        message: 'Conversão iniciada. Isso pode levar 1 ou mais minutos.',
      });
    } catch (error) {
      toggleNotification({
        type: 'danger',
        message: formatConverterError(error as Parameters<typeof formatAPIError>[0]),
      });
    }
  };

  const handleParseError = React.useCallback(() => {
    changeViewMode('raw');
    toggleNotification({
      type: 'warning',
      message: 'Não foi possível interpretar o XML como um artigo; exibindo o conteúdo bruto.',
    });
  }, [changeViewMode, toggleNotification]);

  const handleDraftChange = React.useCallback((value: string) => {
    setDraftXml(value);
    setSaveError(null);
  }, []);

  const handleDiscardDraft = React.useCallback(() => {
    setDraftXml(lastSavedXml);
    setSaveError(null);
    setEditorRevision((revision) => revision + 1);
  }, [lastSavedXml]);

  const handleSaveDraft = React.useCallback(async () => {
    if (draftXml === null || !artigo?.xml) {
      return;
    }

    let normalizedXml: string;
    try {
      parseJatsXml(draftXml);
      normalizedXml = normalizeJatsXml(draftXml);
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
      const file = new File([normalizedXml], JATS_XML_FILENAME, { type: 'application/xml' });
      const succeeded = await replaceXmlFile(file);
      if (succeeded) {
        setLastSavedXml(normalizedXml);
        setDraftXml(normalizedXml);
        setEditorRevision((revision) => revision + 1);
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

  if (artigo.xml && isContentLoading && draftXml === null) {
    return <Page.Loading />;
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
        <ArtigoXmlNavigationContext.Provider value={navigation}>
          <FigureAssetsProvider imageMap={imageMap}>
          <Card padding={6}>
          <Flex direction="column" alignItems="stretch" gap={5}>
            <Box>
              <Typography variant="delta" tag="h2">
                Arquivo XML
              </Typography>
              <Typography variant="pi" textColor="neutral600">
                Visualize, substitua ou gere o arquivo XML associado a este artigo.
              </Typography>
            </Box>

            <Divider />

            {artigo.xml ? (
              <Flex direction="column" alignItems="stretch" gap={4}>
                <Flex justifyContent="space-between" alignItems="center" wrap="wrap" gap={3}>
                  <Flex direction="column" alignItems="flex-start" gap={1}>
                    <Typography textColor="neutral600">
                      {formatBytes(artigo.xml.size * 1000)}
                      {artigo.xml.updatedAt
                        ? ` · Atualizado em ${new Date(artigo.xml.updatedAt).toLocaleString('pt-BR')}`
                        : ''}
                      {isDirty ? ' · Alterações não salvas' : ''}
                    </Typography>
                  </Flex>
                  <Flex gap={2}>
                    {draftXml !== null && isDirty && (
                      <>
                        <Button variant="tertiary" onClick={handleDiscardDraft}>
                          Descartar alterações
                        </Button>
                        <Button
                          variant="success"
                          startIcon={<Check />}
                          loading={isSaving}
                          onClick={handleSaveDraft}
                        >
                          Salvar alterações
                        </Button>
                      </>
                    )}
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
                    <Button
                      variant="secondary"
                      startIcon={<Download />}
                      loading={isDownloadingPackage}
                      onClick={handleDownloadPackage}
                    >
                      Baixar pacote
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
                    <Flex gap={2} alignItems="center" wrap="wrap" width="100%">
                      <Button
                        size="S"
                        variant={viewMode === 'rendered' ? 'secondary' : 'ghost'}
                        startIcon={<Eye />}
                        onClick={() => changeViewMode('rendered')}
                      >
                        Artigo renderizado
                      </Button>
                      {/* <Button
                        size="S"
                        variant={viewMode === 'editor' ? 'secondary' : 'ghost'}
                        startIcon={<ListPlus />}
                        onClick={() => setViewMode('editor')}
                      >
                        Editor estruturado
                      </Button> */}
                      <Button
                        size="S"
                        variant={viewMode === 'advanced' ? 'secondary' : 'ghost'}
                        startIcon={<Sparkle />}
                        onClick={() => changeViewMode('advanced')}
                      >
                        Editor avançado
                      </Button>
                      <Button
                        size="S"
                        variant={viewMode === 'raw' ? 'secondary' : 'ghost'}
                        startIcon={<Code />}
                        onClick={() => changeViewMode('raw')}
                      >
                        XML bruto
                      </Button>
                      {viewMode === 'advanced' && <AdvancedEditorSectionNav />}
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
                        ref={viewportRef}
                        data-artigo-xml-viewport
                        background="neutral0"
                        hasRadius
                        borderColor="neutral200"
                        padding={viewMode === 'raw' ? 0 : 6}
                        maxHeight="70vh"
                        overflow="auto"
                        style={{ position: 'relative' }}
                      >
                        <Box hidden={viewMode !== 'rendered'}>
                          <ArticleRenderer xml={draftXml} onParseError={handleParseError} />
                        </Box>
                        <Box hidden={viewMode !== 'raw'}>
                          <XmlCodeEditor value={draftXml} onChange={handleDraftChange} />
                        </Box>
                        {viewMode === 'editor' && (
                          <StructuredEditor
                            key={editorRevision}
                            xml={draftXml}
                            onChange={handleDraftChange}
                          />
                        )}
                        {viewMode === 'advanced' && (
                          <AdvancedEditor
                            key={editorRevision}
                            xml={draftXml}
                            onChange={handleDraftChange}
                          />
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

            <Flex gap={2} wrap="wrap">
              <Button
                variant="default"
                startIcon={<Sparkle />}
                loading={Boolean(generationJobId)}
                disabled={!artigo.arquivo || Boolean(generationJobId)}
                onClick={handleGenerateXml}
              >
                Gerar XML
              </Button>
            </Flex>

            {generationJobId && (
              <Box background="secondary100" hasRadius borderColor="secondary200" padding={3}>
                <Typography>
                  Convertendo o PDF… Isso pode levar 1 ou mais minutos.
                  {generationStatus?.status
                    ? ` Status: ${formatGenerationStatus(generationStatus.status)}.`
                    : ''}
                </Typography>
              </Box>
            )}

            {generationStatus?.status === 'failed' && generationStatus.error && (
              <Box background="danger100" hasRadius borderColor="danger200" padding={3}>
                <Typography textColor="danger600">
                  {formatConverterUserMessage(generationStatus.error)}
                </Typography>
                {generationStatus.log_tail && (
                  <Typography variant="pi" textColor="neutral600">
                    {generationStatus.log_tail.slice(-1500)}
                  </Typography>
                )}
              </Box>
            )}

            <Divider />

            <Field.Root hint="Selecione o .xml e, opcionalmente, as imagens referenciadas por ele (múltiplos arquivos).">
              <Field.Label>{artigo.xml ? 'Substituir arquivo XML' : 'Enviar arquivo XML'}</Field.Label>
              <Flex gap={2}>
                <Button
                  variant="default"
                  startIcon={<Upload />}
                  loading={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Selecionar arquivos
                </Button>
              </Flex>
              <Field.Hint />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xml,text/xml,application/xml,image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </Field.Root>

            {graphicHrefs.length > 0 && (
              <>
                <Divider />

                <Flex direction="column" alignItems="stretch" gap={3}>
                  <Box>
                    <Typography variant="delta" tag="h2">
                      Imagens do artigo
                    </Typography>
                    <Typography variant="pi" textColor="neutral600">
                      {`${graphicHrefs.length} figura(s) referenciada(s) · ${
                        graphicHrefs.length - missingHrefs.length
                      } carregada(s) · ${missingHrefs.length} pendente(s)`}
                    </Typography>
                  </Box>

                  {missingHrefs.length > 0 && (
                    <Box background="warning100" hasRadius borderColor="warning200" padding={3}>
                      <Typography textColor="warning600">
                        {`Faltam: ${missingHrefs.join(', ')}`}
                      </Typography>
                    </Box>
                  )}

                  <Field.Root hint="Selecione as imagens referenciadas pelo XML (múltiplos arquivos).">
                    <Field.Label>Carregar imagens do artigo</Field.Label>
                    <Flex gap={2} wrap="wrap">
                      <Button
                        variant="default"
                        startIcon={<Images />}
                        loading={isUploadingImages}
                        onClick={() => imagesInputRef.current?.click()}
                      >
                        Selecionar imagens
                      </Button>
                      <Button
                        variant="secondary"
                        loading={isOrganizing}
                        onClick={handleOrganizar}
                      >
                        Organizar arquivos na pasta
                      </Button>
                    </Flex>
                    <Field.Hint />
                    <input
                      ref={imagesInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleImagesFilesChange}
                    />
                  </Field.Root>
                </Flex>
              </>
            )}
          </Flex>
        </Card>
          </FigureAssetsProvider>
        </ArtigoXmlNavigationContext.Provider>
      </Layouts.Content>
    </Page.Main>
  );
};
