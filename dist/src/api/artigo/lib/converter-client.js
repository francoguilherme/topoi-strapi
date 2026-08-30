"use strict";
/**
 * Cliente HTTP da converter-api. O Strapi só orquestra: envia o PDF, consulta o
 * status e baixa JSON + figuras. A conversão em si (~5 min) fica no outro serviço.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversionImage = exports.getConversionResult = exports.getConversionJob = exports.createConversionJob = void 0;
const config = () => {
    const raw = strapi.config.get('converter');
    return {
        apiUrl: ((raw === null || raw === void 0 ? void 0 : raw.apiUrl) || '').replace(/\/$/, ''),
        apiKey: (raw === null || raw === void 0 ? void 0 : raw.apiKey) || '',
    };
};
const requireConfig = () => {
    const { apiUrl, apiKey } = config();
    if (!apiUrl || !apiKey) {
        throw Object.assign(new Error('O conversor PDF → XML não está configurado. Defina CONVERTER_API_URL e CONVERTER_API_KEY.'), { status: 503 });
    }
    return { apiUrl, apiKey };
};
const CONVERTER_UNAVAILABLE = 'O serviço de conversão PDF → XML não está disponível. Verifique se o serviço está em execução.';
const CONNECTION_ERROR_CODES = new Set([
    'ECONNREFUSED',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
]);
const isConnectionError = (error) => {
    if (!(error instanceof Error)) {
        return false;
    }
    const message = error.message.toLowerCase();
    if (message.includes('fetch failed') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('etimedout') ||
        message.includes('network')) {
        return true;
    }
    const codes = new Set();
    const collectCode = (value) => {
        if (value && typeof value === 'object' && 'code' in value) {
            const code = value.code;
            if (typeof code === 'string') {
                codes.add(code);
            }
        }
    };
    collectCode(error);
    collectCode(error.cause);
    const nestedErrors = error.errors;
    if (Array.isArray(nestedErrors)) {
        nestedErrors.forEach(collectCode);
    }
    return [...codes].some((code) => CONNECTION_ERROR_CODES.has(code));
};
const rethrowConverterFetchError = (error) => {
    if (error && typeof error === 'object' && 'status' in error) {
        throw error;
    }
    if (isConnectionError(error)) {
        throw Object.assign(new Error(CONVERTER_UNAVAILABLE), { status: 502 });
    }
    throw error;
};
const converterFetch = async (path, init = {}) => {
    const { apiUrl, apiKey } = requireConfig();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${apiKey}`);
    try {
        return await fetch(`${apiUrl}${path}`, { ...init, headers });
    }
    catch (error) {
        rethrowConverterFetchError(error);
    }
};
const readError = async (response) => {
    var _a;
    try {
        const body = (await response.json());
        return body.detail || ((_a = body.error) === null || _a === void 0 ? void 0 : _a.message) || body.message || response.statusText;
    }
    catch {
        return response.statusText;
    }
};
const createConversionJob = async (pdf, filename) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename || 'artigo.pdf');
    const response = await converterFetch('/jobs', { method: 'POST', body: form });
    if (!response.ok) {
        throw Object.assign(new Error(await readError(response)), { status: response.status });
    }
    return (await response.json());
};
exports.createConversionJob = createConversionJob;
const getConversionJob = async (jobId) => {
    const response = await converterFetch(`/jobs/${encodeURIComponent(jobId)}`);
    if (response.status === 404) {
        throw Object.assign(new Error('Job não encontrado no conversor.'), { status: 404 });
    }
    if (!response.ok) {
        throw Object.assign(new Error(await readError(response)), { status: response.status });
    }
    return (await response.json());
};
exports.getConversionJob = getConversionJob;
const getConversionResult = async (jobId) => {
    const response = await converterFetch(`/jobs/${encodeURIComponent(jobId)}/result`);
    if (!response.ok) {
        throw Object.assign(new Error(await readError(response)), { status: response.status });
    }
    return (await response.json());
};
exports.getConversionResult = getConversionResult;
const getConversionImage = async (jobId, name) => {
    const response = await converterFetch(`/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(name)}`);
    if (!response.ok) {
        throw Object.assign(new Error(await readError(response)), { status: response.status });
    }
    return Buffer.from(await response.arrayBuffer());
};
exports.getConversionImage = getConversionImage;
