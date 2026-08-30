"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Gera um XML de exemplo a partir de article_output.json para inspeção local:
 *   npx tsx scripts/preview-jats.ts
 */
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const jats_builder_1 = require("../src/api/artigo/lib/jats-builder");
const jsonPath = process.argv[2] ||
    path_1.default.resolve('C:/Users/Guilherme/Desktop/Topoi/XMLs/article_output.json');
const json = JSON.parse((0, fs_1.readFileSync)(jsonPath, 'utf8'));
const xml = (0, jats_builder_1.buildJatsXml)({
    titulo: 'Marca registrada: a construção da autorrepresentação de d. Obá II d’África',
    titulo_en: 'Trademark: The Construction of the Self-Representation of d. Obá II d’África',
    titulo_es: 'Marca registrada: la construcción de la autorrepresentación de d. Obá II d’África',
    doi: '10.1590/2237-101X02505541',
    secao: 'Artigo',
    dossie: true,
    pagina_inicial: 1,
    pagina_final: 20,
    data_de_publicacao: '2024-11-25',
    autores: [
        {
            nome: 'Lúcia Klück Stumpf',
            instituicao: 'Universidade de São Paulo',
            departamento: 'Departamento de Artes Plásticas',
            orcid: 'https://orcid.org/0000-0002-7663-1082',
            email: 'luciaks@gmail.com',
        },
    ],
    edicao: { volume: 25, numero: null, data_de_publicacao: '2024-11-25' },
    palavras_chave: [],
    resumo: [],
    resumo_en: [],
    resumo_es: [],
}, json);
const out = path_1.default.resolve('jats-preview.xml');
(0, fs_1.writeFileSync)(out, xml, 'utf8');
console.log(`XML escrito em ${out} (${xml.length} caracteres)`);
console.log(`xrefs bibr: ${(xml.match(/ref-type="bibr"/g) || []).length}`);
console.log(`xrefs fn: ${(xml.match(/ref-type="fn"/g) || []).length}`);
console.log(`figuras: ${(xml.match(/<fig /g) || []).length}`);
console.log(`notas: ${(xml.match(/<fn /g) || []).length}`);
console.log(`refs: ${(xml.match(/<ref /g) || []).length}`);
