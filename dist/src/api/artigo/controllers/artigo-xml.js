"use strict";
/**
 * artigo-xml controller
 *
 * Endpoints usados pela tela "Gerenciar XML" do admin para manter o pacote JATS
 * (XML + figuras + PDF) agrupado em `xml/{documentId}/` na Media Library e para
 * baixar esse pacote como .zip.
 *
 * As rotas são registradas como rotas de admin em `src/index.ts`: rotas dentro
 * de `src/api/*\/routes` são sempre content-api e não aceitam o JWT do admin.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const artigo_media_folder_1 = require("../services/artigo-media-folder");
const converter_client_1 = require("../lib/converter-client");
const artigo_xml_generate_1 = require("../lib/artigo-xml-generate");
const artigo_pacote_1 = require("../lib/artigo-pacote");
const ARTIGO_UID = 'api::artigo.artigo';
const mediaFolderService = () => strapi.service(`${ARTIGO_UID}-media-folder`);
const findArtigo = async (documentId) => strapi.documents(ARTIGO_UID).findOne({
    documentId,
    populate: ['xml', 'arquivo', 'imagens'],
});
/** Normaliza `ctx.request.files.files`, que vem como objeto único ou array. */
const incomingFiles = (ctx) => {
    var _a, _b;
    const files = (_b = (_a = ctx.request) === null || _a === void 0 ? void 0 : _a.files) === null || _b === void 0 ? void 0 : _b.files;
    if (!files) {
        return [];
    }
    return Array.isArray(files) ? files : [files];
};
const toMediaSummary = (file) => ({
    id: file.id,
    name: file.name,
    url: file.url,
    mime: file.mime,
    size: file.size,
});
exports.default = {
    /**
     * Envia (ou substitui) o XML do artigo, sempre dentro de `xml/{documentId}/`.
     * O arquivo anterior é removido para não deixar duplicata na biblioteca.
     */
    async uploadXml(ctx) {
        var _a;
        const { documentId } = ctx.params;
        const artigo = await findArtigo(documentId);
        if (!artigo) {
            return ctx.notFound('Artigo não encontrado.');
        }
        const [file] = incomingFiles(ctx);
        if (!file) {
            return ctx.badRequest('Nenhum arquivo XML enviado.');
        }
        const fileName = artigo_media_folder_1.JATS_XML_FILENAME;
        if (!/\.xml$/i.test(fileName)) {
            return ctx.badRequest('O arquivo precisa ter extensão .xml.');
        }
        const previousXmlId = (_a = artigo.xml) === null || _a === void 0 ? void 0 : _a.id;
        const uploaded = await mediaFolderService().uploadToArtigoFolder(file, documentId, {
            fileName,
            user: ctx.state.user,
        });
        await strapi.documents(ARTIGO_UID).update({
            documentId,
            data: { xml: uploaded.id },
        });
        if (previousXmlId && previousXmlId !== uploaded.id) {
            try {
                await mediaFolderService().removeFile(previousXmlId);
            }
            catch {
                strapi.log.warn(`Não foi possível remover o XML anterior (${previousXmlId}) do artigo ${documentId}.`);
            }
        }
        ctx.body = { data: { xml: toMediaSummary(uploaded) } };
    },
    /**
     * Envia as figuras referenciadas pelo XML. Imagens com o mesmo nome de uma já
     * vinculada são substituídas; as demais são preservadas, exceto quando o corpo
     * traz `hrefs` — nesse caso, imagens que o XML não referencia mais são
     * descartadas.
     */
    async uploadImagens(ctx) {
        var _a, _b;
        const { documentId } = ctx.params;
        const artigo = await findArtigo(documentId);
        if (!artigo) {
            return ctx.notFound('Artigo não encontrado.');
        }
        const files = incomingFiles(ctx);
        if (files.length === 0) {
            return ctx.badRequest('Nenhuma imagem enviada.');
        }
        const invalid = files.find((file) => !String(file.mimetype || '').startsWith('image/'));
        if (invalid) {
            return ctx.badRequest(`"${invalid.originalFilename}" não é uma imagem válida.`);
        }
        let referencedNames = null;
        const rawHrefs = (_a = ctx.request.body) === null || _a === void 0 ? void 0 : _a.hrefs;
        if (rawHrefs) {
            try {
                const parsed = typeof rawHrefs === 'string' ? JSON.parse(rawHrefs) : rawHrefs;
                if (Array.isArray(parsed)) {
                    referencedNames = new Set(parsed
                        .filter((href) => !(0, artigo_pacote_1.isExternalHref)(href))
                        .map((href) => (0, artigo_pacote_1.hrefBasename)(href).toLowerCase()));
                }
            }
            catch {
                return ctx.badRequest('O campo "hrefs" precisa ser um JSON válido.');
            }
        }
        const service = mediaFolderService();
        const uploaded = [];
        for (const file of files) {
            uploaded.push(await service.uploadToArtigoFolder(file, documentId, {
                fileName: (0, artigo_media_folder_1.uploadBasename)(file.originalFilename, 'imagem'),
                user: ctx.state.user,
            }));
        }
        const uploadedNames = new Set(uploaded.map((file) => file.name.toLowerCase()));
        const previous = (_b = artigo.imagens) !== null && _b !== void 0 ? _b : [];
        const kept = previous.filter((file) => {
            const name = file.name.toLowerCase();
            if (uploadedNames.has(name)) {
                return false;
            }
            return referencedNames ? referencedNames.has(name) : true;
        });
        const keptIds = new Set(kept.map((file) => file.id));
        const discarded = previous.filter((file) => !keptIds.has(file.id));
        const finalImagens = [...kept, ...uploaded];
        await strapi.documents(ARTIGO_UID).update({
            documentId,
            data: { imagens: finalImagens.map((file) => file.id) },
        });
        for (const file of discarded) {
            try {
                await service.removeFile(file.id);
            }
            catch {
                strapi.log.warn(`Não foi possível remover a imagem "${file.name}" (${file.id}) do artigo ${documentId}.`);
            }
        }
        ctx.body = {
            data: {
                imagens: finalImagens.map(toMediaSummary),
                enviadas: uploaded.length,
                removidas: discarded.length,
            },
        };
    },
    /**
     * Move para `xml/{documentId}/` os arquivos já vinculados ao artigo que foram
     * enviados fora deste fluxo (tipicamente o PDF em `arquivo`). Só a pasta muda:
     * os ids dos arquivos — e portanto as relações — continuam os mesmos.
     */
    async organizar(ctx) {
        var _a;
        const { documentId } = ctx.params;
        const artigo = await findArtigo(documentId);
        if (!artigo) {
            return ctx.notFound('Artigo não encontrado.');
        }
        const service = mediaFolderService();
        const alvos = [
            ...(artigo.xml ? [artigo.xml] : []),
            ...(artigo.arquivo ? [artigo.arquivo] : []),
            ...((_a = artigo.imagens) !== null && _a !== void 0 ? _a : []),
        ];
        const movidos = [];
        const falhas = [];
        for (const file of alvos) {
            try {
                await service.assignFileToFolder(file.id, documentId, { user: ctx.state.user });
                movidos.push(file.name);
            }
            catch {
                falhas.push(file.name);
            }
        }
        ctx.body = { data: { pasta: `xml/${documentId}`, movidos, falhas } };
    },
    /**
     * Baixa o pacote do artigo como .zip: o XML (como `jats.xml`) com os
     * `xlink:href` originais e as figuras com o nome exato referenciado.
     */
    async pacote(ctx) {
        const { documentId } = ctx.params;
        const artigo = await findArtigo(documentId);
        if (!artigo) {
            return ctx.notFound('Artigo não encontrado.');
        }
        if (!artigo.xml) {
            return ctx.badRequest('Este artigo não possui um arquivo XML.');
        }
        try {
            const { stream, zipName } = await (0, artigo_pacote_1.buildPacoteStream)(artigo, documentId);
            ctx.set('Content-Type', 'application/zip');
            ctx.set('Content-Disposition', `attachment; filename="${zipName}"`);
            // O objeto Archiver tem `.pipe()` mas não é `instanceof Stream`; o Koa tentaria
            // serializá-lo como JSON. O PassThrough é o corpo legível que o Koa escoa.
            ctx.body = stream;
        }
        catch (error) {
            if (error instanceof artigo_pacote_1.ImagensAusentesError) {
                ctx.status = 422;
                ctx.body = {
                    error: {
                        status: 422,
                        name: 'ImagensAusentes',
                        message: error.message,
                        details: { faltando: error.faltando },
                    },
                };
                return;
            }
            throw error;
        }
    },
    /**
     * Dispara a conversão do PDF do artigo. Responde na hora com o jobId; a
     * montagem do XML acontece quando o cliente consulta `statusGerar`.
     */
    async gerar(ctx) {
        const { documentId } = ctx.params;
        const artigo = await findArtigo(documentId);
        if (!artigo) {
            return ctx.notFound('Artigo não encontrado.');
        }
        if (!artigo.arquivo) {
            return ctx.badRequest('Este artigo não possui um PDF em "arquivo".');
        }
        try {
            const pdf = await (0, artigo_pacote_1.readMediaFile)(artigo.arquivo);
            const created = await (0, converter_client_1.createConversionJob)(pdf, artigo.arquivo.name || 'artigo.pdf');
            ctx.status = 202;
            ctx.body = { data: { jobId: created.job_id, status: created.status } };
        }
        catch (error) {
            const status = (error === null || error === void 0 ? void 0 : error.status) || 502;
            ctx.status = status;
            ctx.body = {
                error: {
                    status,
                    name: 'ConverterError',
                    message: (error === null || error === void 0 ? void 0 : error.message) || 'Não foi possível iniciar a conversão.',
                },
            };
        }
    },
    /**
     * Consulta o job no conversor. Quando ele termina, monta o JATS, sobe XML e
     * figuras, e responde `status: concluido`.
     */
    async statusGerar(ctx) {
        const { documentId, jobId } = ctx.params;
        const artigo = await findArtigo(documentId);
        if (!artigo) {
            return ctx.notFound('Artigo não encontrado.');
        }
        try {
            const result = await (0, artigo_xml_generate_1.pollAndMaybeFinalize)(documentId, jobId, ctx.state.user);
            ctx.body = { data: result };
        }
        catch (error) {
            const status = (error === null || error === void 0 ? void 0 : error.status) || 502;
            ctx.status = status;
            ctx.body = {
                error: {
                    status,
                    name: 'ConverterError',
                    message: (error === null || error === void 0 ? void 0 : error.message) || 'Não foi possível consultar a conversão.',
                },
            };
        }
    },
};
