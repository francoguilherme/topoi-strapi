export interface ArtigoXmlFile {
  id: number;
  name: string;
  url: string;
  size: number;
  mime: string;
  updatedAt?: string;
}

/**
 * Formats a byte count into a human readable string (e.g. `123 KB`).
 */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
};

/**
 * Resolves a file URL returned by the Strapi API into an absolute URL,
 * prefixing it with the backend URL when it's a relative path (local provider).
 */
export const buildFileUrl = (url: string): string => {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const strapiGlobal = (window as unknown as { strapi?: { backendURL?: string } }).strapi;

  return `${strapiGlobal?.backendURL ?? ''}${url}`;
};

const XML_MIME_TYPES = ['text/xml', 'application/xml'];

/**
 * Client-side guard so users don't accidentally upload a non-XML file:
 * checks both the extension and the mime type reported by the browser.
 */
export const isXmlFile = (file: File): boolean => {
  const hasXmlExtension = file.name.toLowerCase().endsWith('.xml');
  const hasXmlMime = file.type === '' || XML_MIME_TYPES.includes(file.type);

  return hasXmlExtension && hasXmlMime;
};

const GENERATION_STATUS_LABELS: Record<string, string> = {
  queued: 'Na fila',
  running: 'Convertendo',
  succeeded: 'Montando XML e imagens',
  failed: 'Falhou',
  concluido: 'Concluído',
};

/** Rótulo em português para o status do job de conversão PDF → JATS. */
export const formatGenerationStatus = (status: string): string =>
  GENERATION_STATUS_LABELS[status] ?? status;

const CONVERTER_UNAVAILABLE =
  'O serviço de conversão PDF → XML não está disponível. Verifique se o serviço está em execução.';

/** Torna erros de rede/conversor mais legíveis na UI do admin. */
export const formatConverterUserMessage = (message: string): string => {
  const normalized = message.trim().toLowerCase();

  if (
    normalized === 'fetch failed' ||
    normalized.includes('econnrefused') ||
    normalized.includes('enotfound') ||
    normalized.includes('etimedout') ||
    normalized.includes('network error')
  ) {
    return CONVERTER_UNAVAILABLE;
  }

  return message;
};
