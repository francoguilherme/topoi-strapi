export const ARTIGO_MODEL_UID = 'api::artigo.artigo';

export const ARTIGO_XML_ROUTE_PATH = 'artigo-xml/:documentId';

export const getArtigoXmlPath = (documentId: string) => `/artigo-xml/${documentId}`;

export const getArtigoEditPath = (documentId: string) =>
  `/content-manager/collection-types/${ARTIGO_MODEL_UID}/${documentId}`;
