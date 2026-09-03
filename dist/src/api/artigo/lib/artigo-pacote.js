"use strict";
/**
 * Monta o pacote .zip do artigo (o XML como `jats.xml` com os `xlink:href`
 * originais e as figuras com o nome exato referenciado) e concentra os helpers
 * de leitura de mídia usados pelos controllers admin e público.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPacoteStream = exports.ImagensAusentesError = exports.readMediaFile = exports.isRemote = exports.publicFilePath = exports.pacoteZipBasename = exports.hrefBasename = exports.isExternalHref = exports.extractGraphicHrefs = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const stream_1 = require("stream");
const archiver_1 = __importDefault(require("archiver"));
const artigo_media_folder_1 = require("../services/artigo-media-folder");
/**
 * Extrai os `xlink:href` de `<graphic>` / `<inline-graphic>`. No servidor não há
 * `DOMParser`, e para montar o pacote basta a lista de nomes referenciados.
 */
const extractGraphicHrefs = (xml) => {
    var _a;
    const pattern = /<(?:\w+:)?(?:inline-)?graphic\b[^>]*?\b(?:xlink:)?href\s*=\s*"([^"]*)"/gi;
    const hrefs = [];
    for (const match of xml.matchAll(pattern)) {
        const href = (_a = match[1]) === null || _a === void 0 ? void 0 : _a.trim();
        if (href) {
            hrefs.push(href);
        }
    }
    return hrefs;
};
exports.extractGraphicHrefs = extractGraphicHrefs;
const isExternalHref = (href) => /^(https?:)?\/\//i.test(href);
exports.isExternalHref = isExternalHref;
const hrefBasename = (href) => href.split(/[\\/]/).pop() || href;
exports.hrefBasename = hrefBasename;
/** Limite do nome do .zip para não estourar MAX_PATH do Windows na extração. */
const MAX_PACOTE_ZIP_BASENAME = 80;
const pacoteZipBasename = (slug, documentId) => {
    const base = (slug || documentId).trim();
    if (base.length <= MAX_PACOTE_ZIP_BASENAME) {
        return base;
    }
    return base.slice(0, MAX_PACOTE_ZIP_BASENAME).replace(/[-_]+$/, '');
};
exports.pacoteZipBasename = pacoteZipBasename;
const publicFilePath = (file) => path_1.default.join(strapi.dirs.static.public, file.url);
exports.publicFilePath = publicFilePath;
const isRemote = (file) => /^https?:\/\//i.test(file.url);
exports.isRemote = isRemote;
/** Lê um arquivo da Media Library, seja do disco (provider local) ou da URL. */
const readMediaFile = async (file) => {
    if ((0, exports.isRemote)(file)) {
        const response = await fetch(file.url);
        if (!response.ok) {
            throw new Error(`Não foi possível baixar "${file.name}" (${response.status}).`);
        }
        return Buffer.from(await response.arrayBuffer());
    }
    return promises_1.default.readFile((0, exports.publicFilePath)(file));
};
exports.readMediaFile = readMediaFile;
/** O XML referencia figuras que ainda não foram carregadas no artigo. */
class ImagensAusentesError extends Error {
    constructor(faltando) {
        super('O XML referencia imagens que ainda não foram carregadas.');
        this.faltando = faltando;
        this.name = 'ImagensAusentesError';
    }
}
exports.ImagensAusentesError = ImagensAusentesError;
/**
 * Monta o .zip do artigo e devolve o stream legível junto do nome sugerido.
 * O `logLabel` identifica o artigo nas mensagens de log.
 */
const buildPacoteStream = async (artigo, logLabel) => {
    var _a;
    const xmlBuffer = await (0, exports.readMediaFile)(artigo.xml);
    const imagens = (_a = artigo.imagens) !== null && _a !== void 0 ? _a : [];
    const imagensPorNome = new Map(imagens.map((file) => [file.name.toLowerCase(), file]));
    const hrefsLocais = (0, exports.extractGraphicHrefs)(xmlBuffer.toString('utf8')).filter((href) => !(0, exports.isExternalHref)(href));
    const faltando = hrefsLocais.filter((href) => !imagensPorNome.has((0, exports.hrefBasename)(href).toLowerCase()));
    if (faltando.length > 0) {
        throw new ImagensAusentesError(faltando);
    }
    // Só as figuras realmente referenciadas entram no pacote, com o nome exato
    // usado no `xlink:href` — é isso que mantém o XML utilizável sem reescrita.
    const entradas = [];
    const nomesUsados = new Set();
    for (const href of hrefsLocais) {
        const nome = (0, exports.hrefBasename)(href);
        const chave = nome.toLowerCase();
        if (nomesUsados.has(chave)) {
            continue;
        }
        nomesUsados.add(chave);
        entradas.push({ name: nome, file: imagensPorNome.get(chave) });
    }
    // Arquivos remotos são baixados antes de a resposta começar, para que uma
    // falha de download ainda possa virar um erro HTTP em vez de um zip truncado.
    const remotos = new Map();
    for (const { file } of entradas) {
        if ((0, exports.isRemote)(file)) {
            remotos.set(file.id, await (0, exports.readMediaFile)(file));
        }
    }
    const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 }, forceLocalTime: true });
    const passThrough = new stream_1.PassThrough();
    archive.pipe(passThrough);
    archive.on('warning', (error) => {
        strapi.log.warn(`Aviso ao gerar o pacote do artigo ${logLabel}: ${error.message}`);
    });
    archive.on('error', (error) => {
        strapi.log.error(`Erro ao gerar o pacote do artigo ${logLabel}: ${error.message}`);
        passThrough.destroy(error);
    });
    // Nome curto no pacote — o slug/título do artigo pode passar de 200 caracteres
    // e estourar MAX_PATH do Windows ao extrair o .zip.
    archive.append(xmlBuffer, { name: artigo_media_folder_1.JATS_XML_FILENAME });
    entradas.forEach(({ name, file }) => {
        const buffer = remotos.get(file.id);
        if (buffer) {
            archive.append(buffer, { name });
        }
        else {
            archive.append((0, fs_1.createReadStream)((0, exports.publicFilePath)(file)), { name });
        }
    });
    archive.finalize().catch((error) => {
        strapi.log.error(`Falha ao finalizar o pacote do artigo ${logLabel}: ${error.message}`);
        passThrough.destroy(error);
    });
    return {
        stream: passThrough,
        zipName: `${(0, exports.pacoteZipBasename)(artigo.slug, artigo.documentId)}.zip`,
    };
};
exports.buildPacoteStream = buildPacoteStream;
