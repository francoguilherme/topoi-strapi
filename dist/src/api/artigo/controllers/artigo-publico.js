"use strict";
/**
 * artigo-publico controller
 *
 * Downloads públicos do artigo em URL canônica por `slug`: o XML JATS, o pacote
 * .zip (XML + figuras) e o PDF. Servem à indexação por agregadores como o
 * Redalyc, então respondem sem autenticação e com `Cache-Control` público.
 *
 * As rotas ficam em `src/api/artigo/routes/custom.ts` (content-api), ao
 * contrário das rotas de `artigo-xml`, que são de admin.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const stream_1 = require("stream");
const artigo_pacote_1 = require("../lib/artigo-pacote");
const ARTIGO_UID = 'api::artigo.artigo';
const EDICAO_UID = 'api::edicao.edicao';
const CACHE_CONTROL = 'public, max-age=3600';
const findArtigoBySlug = async (slug) => strapi.documents(ARTIGO_UID).findFirst({
    filters: { slug },
    populate: ['xml', 'arquivo', 'imagens', 'edicao'],
});
/**
 * `artigo` não usa draft/publish, mas `edicao` usa. Um artigo cuja edição ainda
 * está em rascunho não deve vazar por estas rotas.
 */
const edicaoPublicada = async (artigo) => {
    var _a;
    if (!((_a = artigo.edicao) === null || _a === void 0 ? void 0 : _a.documentId)) {
        return true;
    }
    const publicada = await strapi.documents(EDICAO_UID).findOne({
        documentId: artigo.edicao.documentId,
        status: 'published',
    });
    return Boolean(publicada);
};
/** Nome base dos downloads, já truncado para não estourar MAX_PATH. */
const baseName = (artigo) => (0, artigo_pacote_1.pacoteZipBasename)(artigo.slug, artigo.documentId);
/**
 * Resolve o artigo e aplica as guardas comuns às três rotas. Devolve `null`
 * quando já respondeu 404 — nesse caso a action deve apenas retornar.
 */
const resolveArtigo = async (ctx) => {
    const { slug } = ctx.params;
    const artigo = await findArtigoBySlug(slug);
    if (!artigo || !(await edicaoPublicada(artigo))) {
        ctx.notFound('Artigo não encontrado.');
        return null;
    }
    return artigo;
};
/** Devolve o corpo legível de um arquivo da Media Library, sem bufferizar. */
const mediaStream = async (file) => {
    if (!(0, artigo_pacote_1.isRemote)(file)) {
        return (0, fs_1.createReadStream)((0, artigo_pacote_1.publicFilePath)(file));
    }
    const response = await fetch(file.url);
    if (!response.ok || !response.body) {
        throw new Error(`Não foi possível baixar "${file.name}" (${response.status}).`);
    }
    return stream_1.Readable.fromWeb(response.body);
};
exports.default = {
    /** XML JATS do artigo, inline para que o harvester consiga ler direto. */
    async xml(ctx) {
        const artigo = await resolveArtigo(ctx);
        if (!artigo) {
            return;
        }
        if (!artigo.xml) {
            return ctx.notFound('Este artigo não possui um arquivo XML.');
        }
        const xmlBuffer = await (0, artigo_pacote_1.readMediaFile)(artigo.xml);
        ctx.set('Content-Type', 'application/xml; charset=utf-8');
        ctx.set('Content-Disposition', `inline; filename="${baseName(artigo)}.xml"`);
        ctx.set('Cache-Control', CACHE_CONTROL);
        ctx.body = xmlBuffer;
    },
    /** Pacote .zip com o XML como `jats.xml` e as figuras que ele referencia. */
    async pacoteXml(ctx) {
        const artigo = await resolveArtigo(ctx);
        if (!artigo) {
            return;
        }
        if (!artigo.xml) {
            return ctx.notFound('Este artigo não possui um arquivo XML.');
        }
        try {
            const { stream, zipName } = await (0, artigo_pacote_1.buildPacoteStream)(artigo, artigo.slug || artigo.documentId);
            ctx.set('Content-Type', 'application/zip');
            ctx.set('Content-Disposition', `attachment; filename="${zipName}"`);
            ctx.set('Cache-Control', CACHE_CONTROL);
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
    /** PDF do artigo. Remoto é reenviado por aqui para preservar a URL canônica. */
    async pdf(ctx) {
        const artigo = await resolveArtigo(ctx);
        if (!artigo) {
            return;
        }
        if (!artigo.arquivo) {
            return ctx.notFound('Este artigo não possui um PDF.');
        }
        ctx.set('Content-Type', 'application/pdf');
        ctx.set('Content-Disposition', `inline; filename="${baseName(artigo)}.pdf"`);
        ctx.set('Cache-Control', CACHE_CONTROL);
        ctx.body = await mediaStream(artigo.arquivo);
    },
};
