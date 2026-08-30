/**
 * Cliente HTTP da converter-api. O Strapi só orquestra: envia o PDF, consulta o
 * status e baixa JSON + figuras. A conversão em si (~5 min) fica no outro serviço.
 */

import type { ConverterJson } from './jats-builder';

interface ConverterConfig {
  apiUrl: string;
  apiKey: string;
}

export interface ConverterJobStatus {
  job_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
  log_tail?: string;
  original_filename?: string;
}

const config = (): ConverterConfig => {
  const raw = strapi.config.get('converter') as ConverterConfig | undefined;
  return {
    apiUrl: (raw?.apiUrl || '').replace(/\/$/, ''),
    apiKey: raw?.apiKey || '',
  };
};

const requireConfig = (): ConverterConfig => {
  const { apiUrl, apiKey } = config();
  if (!apiUrl || !apiKey) {
    throw Object.assign(
      new Error(
        'O conversor PDF → XML não está configurado. Defina CONVERTER_API_URL e CONVERTER_API_KEY.'
      ),
      { status: 503 }
    );
  }
  return { apiUrl, apiKey };
};

const CONVERTER_UNAVAILABLE =
  'O serviço de conversão PDF → XML não está disponível. Verifique se o serviço está em execução.';

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const isConnectionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (
    message.includes('fetch failed') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('etimedout') ||
    message.includes('network')
  ) {
    return true;
  }

  const codes = new Set<string>();
  const collectCode = (value: unknown) => {
    if (value && typeof value === 'object' && 'code' in value) {
      const code = (value as { code?: unknown }).code;
      if (typeof code === 'string') {
        codes.add(code);
      }
    }
  };

  collectCode(error);
  collectCode((error as { cause?: unknown }).cause);

  const nestedErrors = (error as { errors?: unknown }).errors;
  if (Array.isArray(nestedErrors)) {
    nestedErrors.forEach(collectCode);
  }

  return [...codes].some((code) => CONNECTION_ERROR_CODES.has(code));
};

const rethrowConverterFetchError = (error: unknown): never => {
  if (error && typeof error === 'object' && 'status' in error) {
    throw error;
  }

  if (isConnectionError(error)) {
    throw Object.assign(new Error(CONVERTER_UNAVAILABLE), { status: 502 });
  }

  throw error;
};

const converterFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const { apiUrl, apiKey } = requireConfig();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${apiKey}`);

  try {
    return await fetch(`${apiUrl}${path}`, { ...init, headers });
  } catch (error) {
    rethrowConverterFetchError(error);
  }
};

const readError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as {
      detail?: string;
      error?: { message?: string };
      message?: string;
    };
    return body.detail || body.error?.message || body.message || response.statusText;
  } catch {
    return response.statusText;
  }
};

export const createConversionJob = async (pdf: Buffer, filename: string): Promise<{ job_id: string; status: string }> => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename || 'artigo.pdf');

  const response = await converterFetch('/jobs', { method: 'POST', body: form });
  if (!response.ok) {
    throw Object.assign(new Error(await readError(response)), { status: response.status });
  }
  return (await response.json()) as { job_id: string; status: string };
};

export const getConversionJob = async (jobId: string): Promise<ConverterJobStatus> => {
  const response = await converterFetch(`/jobs/${encodeURIComponent(jobId)}`);
  if (response.status === 404) {
    throw Object.assign(new Error('Job não encontrado no conversor.'), { status: 404 });
  }
  if (!response.ok) {
    throw Object.assign(new Error(await readError(response)), { status: response.status });
  }
  return (await response.json()) as ConverterJobStatus;
};

export const getConversionResult = async (jobId: string): Promise<ConverterJson> => {
  const response = await converterFetch(`/jobs/${encodeURIComponent(jobId)}/result`);
  if (!response.ok) {
    throw Object.assign(new Error(await readError(response)), { status: response.status });
  }
  return (await response.json()) as ConverterJson;
};

export const getConversionImage = async (jobId: string, name: string): Promise<Buffer> => {
  const response = await converterFetch(
    `/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(name)}`
  );
  if (!response.ok) {
    throw Object.assign(new Error(await readError(response)), { status: response.status });
  }
  return Buffer.from(await response.arrayBuffer());
};
