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

import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { PassThrough } from 'stream';
import archiver from 'archiver';

import { JATS_XML_FILENAME, uploadBasename } from '../services/artigo-media-folder';
import { createConversionJob } from '../lib/converter-client';
import { pollAndMaybeFinalize } from '../lib/artigo-xml-generate';

const ARTIGO_UID = 'api::artigo.artigo';

/**
 * Extrai os `xlink:href` de `<graphic>` / `<inline-graphic>`. No servidor não há
 * `DOMParser`, e para montar o pacote basta a lista de nomes referenciados.
 */
const extractGraphicHrefs = (xml: string): string[] => {
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

const isExternalHref = (href: string): boolean => /^(https?:)?\/\//i.test(href);

const hrefBasename = (href: string): string => href.split(/[\\/]/).pop() || href;

/** Limite do nome do .zip para não estourar MAX_PATH do Windows na extração. */
const MAX_PACOTE_ZIP_BASENAME = 80;

const pacoteZipBasename = (slug: string | null | undefined, documentId: string): string => {
  const base = (slug || documentId).trim();
  if (base.length <= MAX_PACOTE_ZIP_BASENAME) {
    return base;
  }
  return base.slice(0, MAX_PACOTE_ZIP_BASENAME).replace(/[-_]+$/, '');
};

interface MediaFile {
  id: number;
  name: string;
  url: string;
  mime: string;
  size: number;
}

interface ArtigoWithMedia {
  id: number;
  documentId: string;
  titulo: string;
  slug?: string | null;
  xml?: MediaFile | null;
  arquivo?: MediaFile | null;
  imagens?: MediaFile[] | null;
}

const mediaFolderService = () => strapi.service(`${ARTIGO_UID}-media-folder`);

const findArtigo = async (documentId: string): Promise<ArtigoWithMedia | null> =>
  strapi.documents(ARTIGO_UID).findOne({
    documentId,
    populate: ['xml', 'arquivo', 'imagens'],
  }) as unknown as Promise<ArtigoWithMedia | null>;

/** Normaliza `ctx.request.files.files`, que vem como objeto único ou array. */
const incomingFiles = (ctx: any): any[] => {
  const files = ctx.request?.files?.files;
  if (!files) {
    return [];
  }
  return Array.isArray(files) ? files : [files];
};

const publicFilePath = (file: MediaFile): string =>
  path.join(strapi.dirs.static.public, file.url);

const isRemote = (file: MediaFile): boolean => /^https?:\/\//i.test(file.url);

/** Lê um arquivo da Media Library, seja do disco (provider local) ou da URL. */
const readMediaFile = async (file: MediaFile): Promise<Buffer> => {
  if (isRemote(file)) {
    const response = await fetch(file.url);
    if (!response.ok) {
      throw new Error(`Não foi possível baixar "${file.name}" (${response.status}).`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  return fs.readFile(publicFilePath(file));
};

const toMediaSummary = (file: MediaFile) => ({
  id: file.id,
  name: file.name,
  url: file.url,
  mime: file.mime,
  size: file.size,
});

export default {
  /**
   * Envia (ou substitui) o XML do artigo, sempre dentro de `xml/{documentId}/`.
   * O arquivo anterior é removido para não deixar duplicata na biblioteca.
   */
  async uploadXml(ctx: any) {
    const { documentId } = ctx.params;
    const artigo = await findArtigo(documentId);

    if (!artigo) {
      return ctx.notFound('Artigo não encontrado.');
    }

    const [file] = incomingFiles(ctx);
    if (!file) {
      return ctx.badRequest('Nenhum arquivo XML enviado.');
    }

    const fileName = JATS_XML_FILENAME;
    if (!/\.xml$/i.test(fileName)) {
      return ctx.badRequest('O arquivo precisa ter extensão .xml.');
    }

    const previousXmlId = artigo.xml?.id;

    const uploaded: MediaFile = await mediaFolderService().uploadToArtigoFolder(file, documentId, {
      fileName,
      user: ctx.state.user,
    });

    await strapi.documents(ARTIGO_UID).update({
      documentId,
      data: { xml: uploaded.id } as any,
    });

    if (previousXmlId && previousXmlId !== uploaded.id) {
      try {
        await mediaFolderService().removeFile(previousXmlId);
      } catch {
        strapi.log.warn(
          `Não foi possível remover o XML anterior (${previousXmlId}) do artigo ${documentId}.`
        );
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
  async uploadImagens(ctx: any) {
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

    let referencedNames: Set<string> | null = null;
    const rawHrefs = ctx.request.body?.hrefs;
    if (rawHrefs) {
      try {
        const parsed = typeof rawHrefs === 'string' ? JSON.parse(rawHrefs) : rawHrefs;
        if (Array.isArray(parsed)) {
          referencedNames = new Set(
            parsed
              .filter((href: string) => !isExternalHref(href))
              .map((href: string) => hrefBasename(href).toLowerCase())
          );
        }
      } catch {
        return ctx.badRequest('O campo "hrefs" precisa ser um JSON válido.');
      }
    }

    const service = mediaFolderService();
    const uploaded: MediaFile[] = [];

    for (const file of files) {
      uploaded.push(
        await service.uploadToArtigoFolder(file, documentId, {
          fileName: uploadBasename(file.originalFilename, 'imagem'),
          user: ctx.state.user,
        })
      );
    }

    const uploadedNames = new Set(uploaded.map((file) => file.name.toLowerCase()));
    const previous = artigo.imagens ?? [];

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
      data: { imagens: finalImagens.map((file) => file.id) } as any,
    });

    for (const file of discarded) {
      try {
        await service.removeFile(file.id);
      } catch {
        strapi.log.warn(
          `Não foi possível remover a imagem "${file.name}" (${file.id}) do artigo ${documentId}.`
        );
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
  async organizar(ctx: any) {
    const { documentId } = ctx.params;
    const artigo = await findArtigo(documentId);

    if (!artigo) {
      return ctx.notFound('Artigo não encontrado.');
    }

    const service = mediaFolderService();
    const alvos: MediaFile[] = [
      ...(artigo.xml ? [artigo.xml] : []),
      ...(artigo.arquivo ? [artigo.arquivo] : []),
      ...(artigo.imagens ?? []),
    ];

    const movidos: string[] = [];
    const falhas: string[] = [];

    for (const file of alvos) {
      try {
        await service.assignFileToFolder(file.id, documentId, { user: ctx.state.user });
        movidos.push(file.name);
      } catch {
        falhas.push(file.name);
      }
    }

    ctx.body = { data: { pasta: `xml/${documentId}`, movidos, falhas } };
  },

  /**
   * Baixa o pacote do artigo como .zip: o XML (como `jats.xml`) com os
   * `xlink:href` originais e as figuras com o nome exato referenciado.
   */
  async pacote(ctx: any) {
    const { documentId } = ctx.params;
    const artigo = await findArtigo(documentId);

    if (!artigo) {
      return ctx.notFound('Artigo não encontrado.');
    }

    if (!artigo.xml) {
      return ctx.badRequest('Este artigo não possui um arquivo XML.');
    }

    const xmlBuffer = await readMediaFile(artigo.xml);
    const imagens = artigo.imagens ?? [];
    const imagensPorNome = new Map(imagens.map((file) => [file.name.toLowerCase(), file]));

    const hrefsLocais = extractGraphicHrefs(xmlBuffer.toString('utf8')).filter(
      (href) => !isExternalHref(href)
    );
    const faltando = hrefsLocais.filter(
      (href) => !imagensPorNome.has(hrefBasename(href).toLowerCase())
    );

    if (faltando.length > 0) {
      ctx.status = 422;
      ctx.body = {
        error: {
          status: 422,
          name: 'ImagensAusentes',
          message: 'O XML referencia imagens que ainda não foram carregadas.',
          details: { faltando },
        },
      };
      return;
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
      strapi.log.warn(`Aviso ao gerar o pacote do artigo ${documentId}: ${error.message}`);
    });
    archive.on('error', (error) => {
      strapi.log.error(`Erro ao gerar o pacote do artigo ${documentId}: ${error.message}`);
      passThrough.destroy(error);
    });

    const zipName = `${pacoteZipBasename(artigo.slug, documentId)}.zip`;

    ctx.set('Content-Type', 'application/zip');
    ctx.set('Content-Disposition', `attachment; filename="${zipName}"`);
    // O objeto Archiver tem `.pipe()` mas não é `instanceof Stream`; o Koa tentaria
    // serializá-lo como JSON. O PassThrough é o corpo legível que o Koa escoa.
    ctx.body = passThrough;

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
      strapi.log.error(`Falha ao finalizar o pacote do artigo ${documentId}: ${error.message}`);
      passThrough.destroy(error);
    });
  },

  /**
   * Dispara a conversão do PDF do artigo. Responde na hora com o jobId; a
   * montagem do XML acontece quando o cliente consulta `statusGerar`.
   */
  async gerar(ctx: any) {
    const { documentId } = ctx.params;
    const artigo = await findArtigo(documentId);

    if (!artigo) {
      return ctx.notFound('Artigo não encontrado.');
    }

    if (!artigo.arquivo) {
      return ctx.badRequest('Este artigo não possui um PDF em "arquivo".');
    }

    try {
      const pdf = await readMediaFile(artigo.arquivo);
      const created = await createConversionJob(pdf, artigo.arquivo.name || 'artigo.pdf');
      ctx.status = 202;
      ctx.body = { data: { jobId: created.job_id, status: created.status } };
    } catch (error: any) {
      const status = error?.status || 502;
      ctx.status = status;
      ctx.body = {
        error: {
          status,
          name: 'ConverterError',
          message: error?.message || 'Não foi possível iniciar a conversão.',
        },
      };
    }
  },

  /**
   * Consulta o job no conversor. Quando ele termina, monta o JATS, sobe XML e
   * figuras, e responde `status: concluido`.
   */
  async statusGerar(ctx: any) {
    const { documentId, jobId } = ctx.params;
    const artigo = await findArtigo(documentId);

    if (!artigo) {
      return ctx.notFound('Artigo não encontrado.');
    }

    try {
      const result = await pollAndMaybeFinalize(documentId, jobId, ctx.state.user);
      ctx.body = { data: result };
    } catch (error: any) {
      const status = error?.status || 502;
      ctx.status = status;
      ctx.body = {
        error: {
          status,
          name: 'ConverterError',
          message: error?.message || 'Não foi possível consultar a conversão.',
        },
      };
    }
  },
};
