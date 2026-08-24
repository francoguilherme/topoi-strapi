/**
 * artigo-media-folder service
 *
 * Mantém os assets de um pacote JATS (XML, figuras e PDF) agrupados na Media
 * Library dentro de `xml/{documentId}/`, espelhando as pastas do repositório
 * SciELO. Nada aqui é retroativo: uma pasta só passa a existir quando o artigo
 * é processado pelo fluxo de Gerenciar XML.
 */

import path from 'path';

const FOLDER_MODEL_UID = 'plugin::upload.folder';
const FILE_MODEL_UID = 'plugin::upload.file';

export const XML_ROOT_FOLDER_NAME = 'xml';

interface UploadFolder {
  id: number;
  name: string;
  path: string;
  pathId: number;
}

interface UploadedFile {
  id: number;
  name: string;
  url: string;
  mime: string;
  size: number;
  ext?: string;
  hash?: string;
  folderPath?: string;
}

/** Arquivo recebido do middleware de body (formidable). */
export interface IncomingFile {
  filepath: string;
  originalFilename?: string | null;
  mimetype?: string | null;
  size: number;
  newFilename?: string;
}

const uploadPlugin = () => strapi.plugin('upload');

const folderService = () => uploadPlugin().service('folder');

const uploadService = () => uploadPlugin().service('upload');

/** Só o nome do arquivo — pastas SciELO podem vir com caminho relativo no upload. */
export const uploadBasename = (name: string | null | undefined, fallback = 'arquivo'): string => {
  const base = path.basename(String(name || '').replace(/\\/g, '/')).trim();
  return base || fallback;
};

/**
 * Localiza uma pasta pelo nome dentro de um pai (ou na raiz, quando
 * `parentId` é `null`). O plugin de upload não expõe um "findByName", então a
 * consulta vai direto no query engine.
 */
const findFolder = async (name: string, parentId: number | null): Promise<UploadFolder | null> =>
  strapi.db.query(FOLDER_MODEL_UID).findOne({
    where: parentId === null ? { name, parent: null } : { name, parent: { id: parentId } },
  });

/**
 * Cria a pasta se ela ainda não existir. Duas requisições simultâneas para o
 * mesmo artigo podem tentar criar a mesma pasta; nesse caso a segunda relê o
 * registro em vez de propagar o erro de concorrência.
 */
const ensureFolder = async (name: string, parentId: number | null): Promise<UploadFolder> => {
  const existing = await findFolder(name, parentId);
  if (existing) {
    return existing;
  }

  try {
    return await folderService().create({ name, parent: parentId });
  } catch (error) {
    const raced = await findFolder(name, parentId);
    if (raced) {
      return raced;
    }
    throw error;
  }
};

/** Pasta raiz `xml/` que agrupa os pacotes de todos os artigos. */
export const ensureXmlRootFolder = async (): Promise<UploadFolder> =>
  ensureFolder(XML_ROOT_FOLDER_NAME, null);

/**
 * Pasta `xml/{documentId}/` do artigo. O `documentId` é o UID que o Strapi 5 já
 * atribui a todo registro, então não há campo extra para preencher.
 */
export const ensureArtigoFolder = async (documentId: string): Promise<UploadFolder> => {
  const root = await ensureXmlRootFolder();
  return ensureFolder(documentId, root.id);
};

/**
 * Envia um arquivo diretamente para a pasta do artigo. `fileName` é preservado
 * como nome do asset para que o `xlink:href` do XML continue casando com a
 * imagem correspondente.
 */
export const uploadToArtigoFolder = async (
  file: IncomingFile,
  documentId: string,
  options: { fileName?: string; user?: unknown } = {}
): Promise<UploadedFile> => {
  const folder = await ensureArtigoFolder(documentId);
  const fileName = uploadBasename(options.fileName ?? file.originalFilename, 'arquivo');

  // O plugin de upload valida `originalFilename` antes de aplicar `fileInfo.name`.
  // Com `webkitdirectory`, o formidable envia caminhos relativos (`pasta/img.png`).
  file.originalFilename = fileName;

  const [uploaded] = await uploadService().upload(
    {
      data: { fileInfo: { name: fileName, folder: folder.id } },
      files: file,
    },
    { user: options.user }
  );

  return uploaded;
};

/**
 * Move um arquivo já existente (PDF, ou um XML enviado antes deste fluxo) para
 * a pasta do artigo. Só a localização na Media Library muda — o `id` do arquivo
 * é preservado, então as relações do artigo continuam válidas.
 */
export const assignFileToFolder = async (
  fileId: number,
  documentId: string,
  options: { user?: unknown } = {}
): Promise<UploadedFile | null> => {
  const file = await strapi.db.query(FILE_MODEL_UID).findOne({ where: { id: fileId } });
  if (!file) {
    return null;
  }

  const folder = await ensureArtigoFolder(documentId);

  if (file.folderPath === folder.path) {
    return file;
  }

  return uploadService().updateFileInfo(fileId, { folder: folder.id }, { user: options.user });
};

/** Remove um arquivo da Media Library (usado para limpar assets órfãos). */
export const removeFile = async (fileId: number): Promise<void> => {
  const file = await strapi.db.query(FILE_MODEL_UID).findOne({ where: { id: fileId } });
  if (file) {
    await uploadService().remove(file);
  }
};

export default () => ({
  ensureXmlRootFolder,
  ensureArtigoFolder,
  uploadToArtigoFolder,
  assignFileToFolder,
  removeFile,
});
