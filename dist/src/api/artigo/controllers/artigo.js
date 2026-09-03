"use strict";
/**
 * artigo controller
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strapi_1 = require("@strapi/strapi");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
exports.default = strapi_1.factories.createCoreController('api::artigo.artigo', ({ strapi }) => ({
    async generateXML(ctx) {
        const artigos = await strapi.entityService.findMany('api::artigo.artigo', {
            limit: 10,
            populate: ['arquivo'],
        });
        if (artigos && Array.isArray(artigos)) {
            const pdfjsLib = await Promise.resolve().then(() => __importStar(require('pdfjs-dist/legacy/build/pdf.mjs')));
            for (const artigo of artigos) {
                console.log(`\nProcessando artigo: ${artigo.titulo}`);
                if (artigo.arquivo && artigo.arquivo.url) {
                    try {
                        const fileUrl = artigo.arquivo.url;
                        const filePath = path_1.default.join(process.cwd(), 'public', fileUrl);
                        console.log(`Lendo arquivo: ${filePath}`);
                        const fileBuffer = await promises_1.default.readFile(filePath);
                        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) });
                        const pdfDocument = await loadingTask.promise;
                        let fullText = '';
                        for (let i = 1; i <= pdfDocument.numPages; i++) {
                            const page = await pdfDocument.getPage(i);
                            const textContent = await page.getTextContent();
                            const pageText = textContent.items.map((item) => item.str).join(' ');
                            fullText += pageText + '\n';
                        }
                        const tmpPath = path_1.default.join(process.cwd(), '.tmp', `artigo_${artigo.id}_text.txt`);
                        await promises_1.default.writeFile(tmpPath, fullText, 'utf8');
                        console.log(`Texto extraido e salvo em: ${tmpPath}`);
                    }
                    catch (error) {
                        console.error(`Erro ao extrair PDF do artigo ${artigo.titulo}:`, error);
                    }
                }
                else {
                    console.log(`Artigo "${artigo.titulo}" não possui arquivo.`);
                }
            }
        }
        ctx.body = { message: 'Extração e geração engatilhados, cheque o console.' };
    }
}));
