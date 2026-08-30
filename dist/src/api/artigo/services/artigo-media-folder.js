"use strict";
/**
 * artigo-media-folder service
 *
 * Mantém os assets de um pacote JATS (XML, figuras e PDF) agrupados na Media
 * Library dentro de `xml/{documentId}/`, espelhando as pastas do repositório
 * SciELO. Nada aqui é retroativo: uma pasta só passa a existir quando o artigo
 * é processado pelo fluxo de Gerenciar XML.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeFile = exports.assignFileToFolder = exports.uploadToArtigoFolder = exports.ensureArtigoFolder = exports.ensureXmlRootFolder = exports.uploadBasename = exports.JATS_XML_FILENAME = exports.XML_ROOT_FOLDER_NAME = void 0;
const path_1 = __importDefault(require("path"));
const FOLDER_MODEL_UID = 'plugin::upload.folder';
const FILE_MODEL_UID = 'plugin::upload.file';
exports.XML_ROOT_FOLDER_NAME = 'xml';
/** Nome fixo do XML JATS na pasta do artigo e dentro do pacote .zip. */
exports.JATS_XML_FILENAME = 'jats.xml';
const uploadPlugin = () => strapi.plugin('upload');
const folderService = () => uploadPlugin().service('folder');
const uploadService = () => uploadPlugin().service('upload');
/** Só o nome do arquivo — pastas SciELO podem vir com caminho relativo no upload. */
const uploadBasename = (name, fallback = 'arquivo') => {
    const base = path_1.default.basename(String(name || '').replace(/\\/g, '/')).trim();
    return base || fallback;
};
exports.uploadBasename = uploadBasename;
/**
 * Localiza uma pasta pelo nome dentro de um pai (ou na raiz, quando
 * `parentId` é `null`). O plugin de upload não expõe um "findByName", então a
 * consulta vai direto no query engine.
 */
const findFolder = async (name, parentId) => strapi.db.query(FOLDER_MODEL_UID).findOne({
    where: parentId === null ? { name, parent: null } : { name, parent: { id: parentId } },
});
/**
 * Cria a pasta se ela ainda não existir. Duas requisições simultâneas para o
 * mesmo artigo podem tentar criar a mesma pasta; nesse caso a segunda relê o
 * registro em vez de propagar o erro de concorrência.
 */
const ensureFolder = async (name, parentId) => {
    const existing = await findFolder(name, parentId);
    if (existing) {
        return existing;
    }
    try {
        return await folderService().create({ name, parent: parentId });
    }
    catch (error) {
        const raced = await findFolder(name, parentId);
        if (raced) {
            return raced;
        }
        throw error;
    }
};
/** Pasta raiz `xml/` que agrupa os pacotes de todos os artigos. */
const ensureXmlRootFolder = async () => ensureFolder(exports.XML_ROOT_FOLDER_NAME, null);
exports.ensureXmlRootFolder = ensureXmlRootFolder;
/**
 * Pasta `xml/{documentId}/` do artigo. O `documentId` é o UID que o Strapi 5 já
 * atribui a todo registro, então não há campo extra para preencher.
 */
const ensureArtigoFolder = async (documentId) => {
    const root = await (0, exports.ensureXmlRootFolder)();
    return ensureFolder(documentId, root.id);
};
exports.ensureArtigoFolder = ensureArtigoFolder;
/**
 * Envia um arquivo diretamente para a pasta do artigo. `fileName` é preservado
 * como nome do asset para que o `xlink:href` do XML continue casando com a
 * imagem correspondente.
 */
const uploadToArtigoFolder = async (file, documentId, options = {}) => {
    var _a;
    const folder = await (0, exports.ensureArtigoFolder)(documentId);
    const fileName = (0, exports.uploadBasename)((_a = options.fileName) !== null && _a !== void 0 ? _a : file.originalFilename, 'arquivo');
    // O plugin de upload valida `originalFilename` antes de aplicar `fileInfo.name`.
    // Com `webkitdirectory`, o formidable envia caminhos relativos (`pasta/img.png`).
    file.originalFilename = fileName;
    const [uploaded] = await uploadService().upload({
        data: { fileInfo: { name: fileName, folder: folder.id } },
        files: file,
    }, { user: options.user });
    return uploaded;
};
exports.uploadToArtigoFolder = uploadToArtigoFolder;
/**
 * Move um arquivo já existente (PDF, ou um XML enviado antes deste fluxo) para
 * a pasta do artigo. Só a localização na Media Library muda — o `id` do arquivo
 * é preservado, então as relações do artigo continuam válidas.
 */
const assignFileToFolder = async (fileId, documentId, options = {}) => {
    const file = await strapi.db.query(FILE_MODEL_UID).findOne({ where: { id: fileId } });
    if (!file) {
        return null;
    }
    const folder = await (0, exports.ensureArtigoFolder)(documentId);
    if (file.folderPath === folder.path) {
        return file;
    }
    return uploadService().updateFileInfo(fileId, { folder: folder.id }, { user: options.user });
};
exports.assignFileToFolder = assignFileToFolder;
/** Remove um arquivo da Media Library (usado para limpar assets órfãos). */
const removeFile = async (fileId) => {
    const file = await strapi.db.query(FILE_MODEL_UID).findOne({ where: { id: fileId } });
    if (file) {
        await uploadService().remove(file);
    }
};
exports.removeFile = removeFile;
exports.default = () => ({
    ensureXmlRootFolder: exports.ensureXmlRootFolder,
    ensureArtigoFolder: exports.ensureArtigoFolder,
    uploadToArtigoFolder: exports.uploadToArtigoFolder,
    assignFileToFolder: exports.assignFileToFolder,
    removeFile: exports.removeFile,
});
