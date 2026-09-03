/**
 * Finaliza um job do conversor: baixa o JSON e as figuras, monta o JATS e
 * grava XML + imagens na pasta `xml/{documentId}/`.
 */

import os from 'os';
import path from 'path';
import { mkdtemp, writeFile, rm } from 'fs/promises';

import {
  getConversionImage,
  getConversionJob,
  getConversionResult,
  type ConverterJobStatus,
} from './converter-client';
import { buildJatsXml, graphicBasename, type ArtigoForJats, type ConverterJson } from './jats-builder';
import { JATS_XML_FILENAME, uploadBasename } from '../services/artigo-media-folder';

const ARTIGO_UID = 'api::artigo.artigo';

const finishing = new Map<string, Promise<FinalizeResult>>();
const finalized = new Set<string>();

interface MediaFile {
  id: number;
  name: string;
  url: string;
  mime: string;
  size: number;
}

export interface FinalizeResult {
  status: 'concluido';
  xml: { id: number; name: string; url: string; mime: string; size: number };
  imagens: Array<{ id: number; name: string; url: string; mime: string; size: number }>;
}

export type GenerationPollResult = ConverterJobStatus | FinalizeResult | { status: 'concluido' };

const mediaFolderService = () => strapi.service(`${ARTIGO_UID}-media-folder`);

const toSummary = (file: MediaFile) => ({
  id: file.id,
  name: file.name,
  url: file.url,
  mime: file.mime,
  size: file.size,
});

export const pollAndMaybeFinalize = async (
  documentId: string,
  jobId: string,
  user: unknown
): Promise<GenerationPollResult> => {
  if (finalized.has(jobId)) {
    return { status: 'concluido' };
  }

  const job = await getConversionJob(jobId);
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

const finalizeJob = async (documentId: string, jobId: string, user: unknown): Promise<FinalizeResult> => {
  const json = await getConversionResult(jobId);
  const artigo = (await strapi.documents(ARTIGO_UID).findOne({
    documentId,
    populate: ['autores', 'edicao', 'palavras_chave', 'xml', 'imagens'],
  })) as ArtigoForJats & { xml?: MediaFile | null; imagens?: MediaFile[] | null };

  if (!artigo) {
    throw Object.assign(new Error('Artigo não encontrado.'), { status: 404 });
  }

  const xml = buildJatsXml(artigo, json);
  const imageNames = collectGraphicNames(json);
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'topoi-jats-'));

  try {
    const xmlPath = path.join(tmpDir, JATS_XML_FILENAME);
    await writeFile(xmlPath, xml, 'utf8');

    const previousXmlId = artigo.xml?.id;
    const uploadedXml: MediaFile = await mediaFolderService().uploadToArtigoFolder(
      {
        filepath: xmlPath,
        originalFilename: JATS_XML_FILENAME,
        mimetype: 'application/xml',
        size: Buffer.byteLength(xml, 'utf8'),
      },
      documentId,
      { fileName: JATS_XML_FILENAME, user }
    );

    await strapi.documents(ARTIGO_UID).update({
      documentId,
      data: { xml: uploadedXml.id } as any,
    });

    if (previousXmlId && previousXmlId !== uploadedXml.id) {
      try {
        await mediaFolderService().removeFile(previousXmlId);
      } catch {
        strapi.log.warn(
          `Não foi possível remover o XML anterior (${previousXmlId}) do artigo ${documentId}.`
        );
      }
    }

    const uploadedImages: MediaFile[] = [];
    for (const name of imageNames) {
      const buffer = await getConversionImage(jobId, name);
      const imagePath = path.join(tmpDir, name);
      await writeFile(imagePath, buffer);
      uploadedImages.push(
        await mediaFolderService().uploadToArtigoFolder(
          {
            filepath: imagePath,
            originalFilename: name,
            mimetype: mimeFromName(name),
            size: buffer.length,
          },
          documentId,
          { fileName: uploadBasename(name, 'imagem'), user }
        )
      );
    }

    const uploadedNames = new Set(uploadedImages.map((file) => file.name.toLowerCase()));
    const referenced = new Set(imageNames.map((name) => name.toLowerCase()));
    const previous = artigo.imagens ?? [];
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
      data: { imagens: finalImagens.map((file) => file.id) } as any,
    });

    for (const file of discarded) {
      try {
        await mediaFolderService().removeFile(file.id);
      } catch {
        strapi.log.warn(
          `Não foi possível remover a imagem "${file.name}" (${file.id}) do artigo ${documentId}.`
        );
      }
    }

    return {
      status: 'concluido',
      xml: toSummary(uploadedXml),
      imagens: finalImagens.map(toSummary),
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
};

const collectGraphicNames = (json: ConverterJson): string[] => {
  const names: string[] = [];
  const walk = (node: unknown) => {
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
    const obj = node as Record<string, unknown>;
    if (obj.type === 'figure' && typeof obj.graphic === 'string') {
      const name = graphicBasename(obj.graphic);
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

const mimeFromName = (name: string): string => {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.tif' || ext === '.tiff') return 'image/tiff';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
};
