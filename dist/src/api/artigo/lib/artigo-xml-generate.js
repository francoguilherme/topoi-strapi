"use strict";
/**
 * Finaliza um job do conversor: baixa o JSON e as figuras, monta o JATS e
 * grava XML + imagens na pasta `xml/{documentId}/`.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollAndMaybeFinalize = void 0;
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const promises_1 = require("fs/promises");
const converter_client_1 = require("./converter-client");
const jats_builder_1 = require("./jats-builder");
const artigo_media_folder_1 = require("../services/artigo-media-folder");
const ARTIGO_UID = 'api::artigo.artigo';
const finishing = new Map();
const finalized = new Set();
const mediaFolderService = () => strapi.service(`${ARTIGO_UID}-media-folder`);
const toSummary = (file) => ({
    id: file.id,
    name: file.name,
    url: file.url,
    mime: file.mime,
    size: file.size,
});
const pollAndMaybeFinalize = async (documentId, jobId, user) => {
    if (finalized.has(jobId)) {
        return { status: 'concluido' };
    }
    const job = await (0, converter_client_1.getConversionJob)(jobId);
    if (job.status !== 'succeeded') {
        return job;
    }
    const existing = finishing.get(jobId);
    if (existing) {
        const result = await existing;
        return result;
    }
    const pending = finalizeJob(documentId, jobId, user)
        .then((result) => {
        finalized.add(jobId);
        return result;
    })
        .finally(() => {
        finishing.delete(jobId);
    });
    finishing.set(jobId, pending);
    return pending;
};
exports.pollAndMaybeFinalize = pollAndMaybeFinalize;
const finalizeJob = async (documentId, jobId, user) => {
    var _a, _b;
    const json = await (0, converter_client_1.getConversionResult)(jobId);
    const artigo = (await strapi.documents(ARTIGO_UID).findOne({
        documentId,
        populate: ['autores', 'edicao', 'palavras_chave', 'xml', 'imagens'],
    }));
    if (!artigo) {
        throw Object.assign(new Error('Artigo não encontrado.'), { status: 404 });
    }
    const xml = (0, jats_builder_1.buildJatsXml)(artigo, json);
    const imageNames = collectGraphicNames(json);
    const tmpDir = await (0, promises_1.mkdtemp)(path_1.default.join(os_1.default.tmpdir(), 'topoi-jats-'));
    try {
        const xmlPath = path_1.default.join(tmpDir, artigo_media_folder_1.JATS_XML_FILENAME);
        await (0, promises_1.writeFile)(xmlPath, xml, 'utf8');
        const previousXmlId = (_a = artigo.xml) === null || _a === void 0 ? void 0 : _a.id;
        const uploadedXml = await mediaFolderService().uploadToArtigoFolder({
            filepath: xmlPath,
            originalFilename: artigo_media_folder_1.JATS_XML_FILENAME,
            mimetype: 'application/xml',
            size: Buffer.byteLength(xml, 'utf8'),
        }, documentId, { fileName: artigo_media_folder_1.JATS_XML_FILENAME, user });
        await strapi.documents(ARTIGO_UID).update({
            documentId,
            data: { xml: uploadedXml.id },
        });
        if (previousXmlId && previousXmlId !== uploadedXml.id) {
            try {
                await mediaFolderService().removeFile(previousXmlId);
            }
            catch {
                strapi.log.warn(`Não foi possível remover o XML anterior (${previousXmlId}) do artigo ${documentId}.`);
            }
        }
        const uploadedImages = [];
        for (const name of imageNames) {
            const buffer = await (0, converter_client_1.getConversionImage)(jobId, name);
            const imagePath = path_1.default.join(tmpDir, name);
            await (0, promises_1.writeFile)(imagePath, buffer);
            uploadedImages.push(await mediaFolderService().uploadToArtigoFolder({
                filepath: imagePath,
                originalFilename: name,
                mimetype: mimeFromName(name),
                size: buffer.length,
            }, documentId, { fileName: (0, artigo_media_folder_1.uploadBasename)(name, 'imagem'), user }));
        }
        const uploadedNames = new Set(uploadedImages.map((file) => file.name.toLowerCase()));
        const referenced = new Set(imageNames.map((name) => name.toLowerCase()));
        const previous = (_b = artigo.imagens) !== null && _b !== void 0 ? _b : [];
        const kept = previous.filter((file) => {
            const name = file.name.toLowerCase();
            if (uploadedNames.has(name)) {
                return false;
            }
            return referenced.has(name);
        });
        const keptIds = new Set(kept.map((file) => file.id));
        const discarded = previous.filter((file) => !keptIds.has(file.id));
        const finalImagens = [...kept, ...uploadedImages];
        await strapi.documents(ARTIGO_UID).update({
            documentId,
            data: { imagens: finalImagens.map((file) => file.id) },
        });
        for (const file of discarded) {
            try {
                await mediaFolderService().removeFile(file.id);
            }
            catch {
                strapi.log.warn(`Não foi possível remover a imagem "${file.name}" (${file.id}) do artigo ${documentId}.`);
            }
        }
        return {
            status: 'concluido',
            xml: toSummary(uploadedXml),
            imagens: finalImagens.map(toSummary),
        };
    }
    finally {
        await (0, promises_1.rm)(tmpDir, { recursive: true, force: true });
    }
};
const collectGraphicNames = (json) => {
    const names = [];
    const walk = (node) => {
        if (!node) {
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (typeof node !== 'object') {
            return;
        }
        const obj = node;
        if (obj.type === 'figure' && typeof obj.graphic === 'string') {
            const name = (0, jats_builder_1.graphicBasename)(obj.graphic);
            if (name) {
                names.push(name);
            }
        }
        if (Array.isArray(obj.paragraphs)) {
            walk(obj.paragraphs);
        }
    };
    walk(json.body);
    walk(json.back_matter);
    const fromResult = (json.images || []).map((image) => image.name).filter(Boolean);
    const ordered = names.length > 0 ? names : fromResult;
    return [...new Set(ordered)];
};
const mimeFromName = (name) => {
    const ext = path_1.default.extname(name).toLowerCase();
    if (ext === '.png')
        return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg')
        return 'image/jpeg';
    if (ext === '.gif')
        return 'image/gif';
    if (ext === '.tif' || ext === '.tiff')
        return 'image/tiff';
    if (ext === '.webp')
        return 'image/webp';
    return 'application/octet-stream';
};
