export const ARTIGO_MODEL_UID = 'api::artigo.artigo';

/** Nome fixo do XML JATS na Media Library e no pacote .zip. */
export const JATS_XML_FILENAME = 'jats.xml';

export const ARTIGO_XML_ROUTE_PATH = 'artigo-xml/:documentId';

export const getArtigoXmlPath = (documentId: string) => `/artigo-xml/${documentId}`;

export const getArtigoEditPath = (documentId: string) =>
  `/content-manager/collection-types/${ARTIGO_MODEL_UID}/${documentId}`;

/** Scroll container for rendered/structured/advanced XML views in `ArtigoXmlPage`. */
export const ARTIGO_XML_VIEWPORT_SELECTOR = '[data-artigo-xml-viewport]';
