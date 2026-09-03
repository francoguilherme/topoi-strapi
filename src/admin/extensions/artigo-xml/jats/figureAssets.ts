import type { ArtigoXmlFile } from '../utils';
import { buildFileUrl } from '../utils';

const XLINK_NS = 'http://www.w3.org/1999/xlink';

/**
 * `<graphic>` guarda o caminho do pacote SciELO (ex.: `...-gf01.png`), não uma
 * URL do Strapi. Estes utilitários casam esses caminhos com os arquivos que o
 * artigo tem na Media Library, para que a prévia consiga exibir as figuras sem
 * que o XML precise ser reescrito.
 */

const graphicHref = (el: Element): string =>
  (
    el.getAttributeNS(XLINK_NS, 'href') ||
    el.getAttribute('xlink:href') ||
    el.getAttribute('href') ||
    ''
  ).trim();

/** Caminhos externos são usados como estão; não precisam de upload. */
export const isExternalHref = (href: string): boolean => /^(https?:)?\/\//i.test(href);

/** Último segmento do caminho — os pacotes SciELO usam nomes de arquivo planos. */
export const hrefBasename = (href: string): string => href.split(/[\\/]/).pop() || href;

/**
 * Lista os `xlink:href` locais referenciados pelas figuras do XML, na ordem em
 * que aparecem e sem repetições. Retorna vazio se o XML não for bem formado —
 * a página já tem um caminho próprio para reportar erro de parsing.
 */
export const extractGraphicHrefs = (xml: string): string[] => {
  let doc: Document;

  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return [];
  }

  if (doc.querySelector('parsererror')) {
    return [];
  }

  const hrefs: string[] = [];
  const seen = new Set<string>();

  doc.querySelectorAll('graphic, inline-graphic').forEach((el) => {
    const href = graphicHref(el);
    if (!href || isExternalHref(href) || seen.has(href)) {
      return;
    }
    seen.add(href);
    hrefs.push(href);
  });

  return hrefs;
};

/**
 * Mapeia o nome do arquivo (em caixa baixa) para a URL absoluta no Strapi.
 * A comparação é case-insensitive porque as pastas vêm do Windows, onde o nome
 * gravado no XML nem sempre bate exatamente com o do arquivo em disco.
 */
export const buildImageMap = (imagens: ArtigoXmlFile[] | null | undefined): Map<string, string> => {
  const map = new Map<string, string>();

  (imagens ?? []).forEach((file) => {
    map.set(file.name.toLowerCase(), buildFileUrl(file.url));
  });

  return map;
};

export interface FigureMatch {
  /** Hrefs do XML que têm um arquivo correspondente na pasta escolhida. */
  matched: Array<{ href: string; file: File }>;
  /** Hrefs sem arquivo correspondente. */
  missing: string[];
  /** Arquivos da pasta que o XML não referencia. */
  unused: File[];
}

/**
 * Casa os hrefs do XML com os arquivos de uma pasta local escolhida pelo
 * usuário. A pasta pode ter subpastas e conter arquivos extras (o próprio XML,
 * por exemplo); só entram os que o XML referencia.
 */
export const matchFolderFiles = (hrefs: string[], files: File[]): FigureMatch => {
  const byName = new Map<string, File>();

  files.forEach((file) => {
    const key = file.name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, file);
    }
  });

  const matched: FigureMatch['matched'] = [];
  const missing: string[] = [];
  const usedNames = new Set<string>();

  hrefs.forEach((href) => {
    const key = hrefBasename(href).toLowerCase();
    const file = byName.get(key);

    if (file) {
      matched.push({ href, file });
      usedNames.add(key);
    } else {
      missing.push(href);
    }
  });

  const unused = files.filter(
    (file) => file.type.startsWith('image/') && !usedNames.has(file.name.toLowerCase())
  );

  return { matched, missing, unused };
};

/**
 * Resolve o href de uma figura para algo exibível: caminhos externos passam
 * direto, caminhos locais viram a URL do arquivo no Strapi. Sem correspondência,
 * devolve o href original (a imagem aparece quebrada, sinalizando o que falta).
 */
export const resolveFigureHref = (href: string, imageMap: Map<string, string>): string => {
  if (!href || isExternalHref(href)) {
    return href;
  }

  return imageMap.get(hrefBasename(href).toLowerCase()) ?? href;
};
