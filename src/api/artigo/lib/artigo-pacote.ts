/**
 * Monta o pacote .zip do artigo (o XML como `jats.xml` com os `xlink:href`
 * originais e as figuras com o nome exato referenciado) e concentra os helpers
 * de leitura de mídia usados pelos controllers admin e público.
 */

import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { PassThrough } from 'stream';
import archiver from 'archiver';

import { JATS_XML_FILENAME } from '../services/artigo-media-folder';

export interface MediaFile {
  id: number;
  name: string;
  url: string;
  mime: string;
  size: number;
}

export interface ArtigoWithMedia {
  id: number;
  documentId: string;
  titulo: string;
  slug?: string | null;
  xml?: MediaFile | null;
  arquivo?: MediaFile | null;
  imagens?: MediaFile[] | null;
}

/**
 * Extrai os `xlink:href` de `<graphic>` / `<inline-graphic>`. No servidor não há
 * `DOMParser`, e para montar o pacote basta a lista de nomes referenciados.
 */
export const extractGraphicHrefs = (xml: string): string[] => {
  const pattern = /<(?:\w+:)?(?:inline-)?graphic\b[^>]*?\b(?:xlink:)?href\s*=\s*"([^"]*)"/gi;
  const hrefs: string[] = [];

  for (const match of xml.matchAll(pattern)) {
    const href = match[1]?.trim();
    if (href) {
      hrefs.push(href);
    }
  }

  return hrefs;
};

export const isExternalHref = (href: string): boolean => /^(https?:)?\/\//i.test(href);

export const hrefBasename = (href: string): string => href.split(/[\\/]/).pop() || href;

/** Limite do nome do .zip para não estourar MAX_PATH do Windows na extração. */
const MAX_PACOTE_ZIP_BASENAME = 80;

export const pacoteZipBasename = (slug: string | null | undefined, documentId: string): string => {
  const base = (slug || documentId).trim();
  if (base.length <= MAX_PACOTE_ZIP_BASENAME) {
    return base;
  }
  return base.slice(0, MAX_PACOTE_ZIP_BASENAME).replace(/[-_]+$/, '');
};

export const publicFilePath = (file: MediaFile): string =>
  path.join(strapi.dirs.static.public, file.url);

export const isRemote = (file: MediaFile): boolean => /^https?:\/\//i.test(file.url);

/** Lê um arquivo da Media Library, seja do disco (provider local) ou da URL. */
export const readMediaFile = async (file: MediaFile): Promise<Buffer> => {
  if (isRemote(file)) {
    const response = await fetch(file.url);
    if (!response.ok) {
      throw new Error(`Não foi possível baixar "${file.name}" (${response.status}).`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  return fs.readFile(publicFilePath(file));
};

/** O XML referencia figuras que ainda não foram carregadas no artigo. */
export class ImagensAusentesError extends Error {
  constructor(public readonly faltando: string[]) {
    super('O XML referencia imagens que ainda não foram carregadas.');
    this.name = 'ImagensAusentesError';
  }
}

/**
 * Monta o .zip do artigo e devolve o stream legível junto do nome sugerido.
 * O `logLabel` identifica o artigo nas mensagens de log.
 */
export const buildPacoteStream = async (
  artigo: ArtigoWithMedia,
  logLabel: string
): Promise<{ stream: PassThrough; zipName: string }> => {
  const xmlBuffer = await readMediaFile(artigo.xml!);
  const imagens = artigo.imagens ?? [];
  const imagensPorNome = new Map(imagens.map((file) => [file.name.toLowerCase(), file]));

  const hrefsLocais = extractGraphicHrefs(xmlBuffer.toString('utf8')).filter(
    (href) => !isExternalHref(href)
  );
  const faltando = hrefsLocais.filter(
    (href) => !imagensPorNome.has(hrefBasename(href).toLowerCase())
  );

  if (faltando.length > 0) {
    throw new ImagensAusentesError(faltando);
  }

  // Só as figuras realmente referenciadas entram no pacote, com o nome exato
  // usado no `xlink:href` — é isso que mantém o XML utilizável sem reescrita.
  const entradas: Array<{ name: string; file: MediaFile }> = [];
  const nomesUsados = new Set<string>();

  for (const href of hrefsLocais) {
    const nome = hrefBasename(href);
    const chave = nome.toLowerCase();
    if (nomesUsados.has(chave)) {
      continue;
    }
    nomesUsados.add(chave);
    entradas.push({ name: nome, file: imagensPorNome.get(chave)! });
  }

  // Arquivos remotos são baixados antes de a resposta começar, para que uma
  // falha de download ainda possa virar um erro HTTP em vez de um zip truncado.
  const remotos = new Map<number, Buffer>();
  for (const { file } of entradas) {
    if (isRemote(file)) {
      remotos.set(file.id, await readMediaFile(file));
    }
  }

  const archive = archiver('zip', { zlib: { level: 9 }, forceLocalTime: true });
  const passThrough = new PassThrough();
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
  archive.append(xmlBuffer, { name: JATS_XML_FILENAME });

  entradas.forEach(({ name, file }) => {
    const buffer = remotos.get(file.id);
    if (buffer) {
      archive.append(buffer, { name });
    } else {
      archive.append(createReadStream(publicFilePath(file)), { name });
    }
  });

  archive.finalize().catch((error) => {
    strapi.log.error(`Falha ao finalizar o pacote do artigo ${logLabel}: ${error.message}`);
    passThrough.destroy(error);
  });

  return {
    stream: passThrough,
    zipName: `${pacoteZipBasename(artigo.slug, artigo.documentId)}.zip`,
  };
};
