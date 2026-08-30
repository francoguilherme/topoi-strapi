"use strict";
/**
 * Monta um artigo JATS/SPS a partir dos metadados do CMS e do JSON do conversor.
 *
 * Front matter vem do Strapi; abstracts/keywords do CMS têm prioridade e o JSON
 * só entra quando o campo correspondente está vazio. Corpo, notas, back matter e
 * referências saem do JSON. Ids do conversor (`reference-13`, `footnote-1`,
 * `figure-1`, `table-1`) são traduzidos para o padrão SciELO (`B13`, `fn1`, `f1`, `t1`).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.flattenBlocks = exports.splitPersonName = exports.graphicBasename = exports.toSpsId = exports.mapMarkdownTarget = exports.appendMixed = exports.buildJatsXml = void 0;
const xmlbuilder2_1 = require("xmlbuilder2");
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const MML_NS = 'http://www.w3.org/1998/Math/MathML';
const JOURNAL = {
    publisherId: 'topoi',
    title: 'Topoi: Revista de História',
    abbrev: 'Topoi (Rio J.)',
    issnPpub: '1518-3319',
    issnEpub: '2237-101X',
    publisher: 'Universidade Federal do Rio de Janeiro or Programa de Pós-Graduação em História Social da Universidade Federal do Rio de Janeiro',
};
const LICENSE_HREF = 'http://creativecommons.org/licenses/by/4.0/';
const LICENSE_P = 'Este é um artigo publicado em acesso aberto (Open Access) sob a licença Creative Commons Attribution, que permite uso, distribuição e reprodução em qualquer meio, sem restrições desde que o trabalho original seja corretamente citado.';
const NAME_PARTICLES = new Set([
    'da',
    'de',
    'do',
    'dos',
    'das',
    'del',
    'della',
    'van',
    'von',
    'di',
    "d'",
]);
const MD_LINK_RE = /\[([^\]]*)\]\(#([A-Za-z]+)-(\d+)\)/g;
const URL_RE = /(https?:\/\/[^\s<>"'\)\]]+)/g;
const ARTICLE_TYPE_BY_SECAO = {
    Artigo: 'research-article',
    Resenha: 'book-review',
    Entrevista: 'interview',
    Documento: 'other',
};
const KWD_TITLES = {
    pt: 'Palavras-chave',
    en: 'Keywords',
    es: 'Palabras clave',
};
const ABSTRACT_TITLES = {
    pt: 'RESUMO',
    en: 'ABSTRACT',
    es: 'RESUMEN',
};
const buildJatsXml = (artigo, json) => {
    var _a, _b, _c, _d;
    const doc = (0, xmlbuilder2_1.create)({ version: '1.0', encoding: 'UTF-8' }).dtd({
        pubID: '-//NLM//DTD JATS (Z39.96) Journal Publishing DTD v1.1 20151215//EN',
        sysID: 'https://jats.nlm.nih.gov/publishing/1.1/JATS-journalpublishing1.dtd',
    });
    const article = doc.ele('article', {
        'xmlns:mml': MML_NS,
        'xmlns:xlink': XLINK_NS,
        'article-type': ARTICLE_TYPE_BY_SECAO[artigo.secao || 'Artigo'] || 'research-article',
        'dtd-version': '1.1',
        'specific-use': 'sps-1.9',
        'xml:lang': 'pt',
    });
    const front = article.ele('front');
    appendJournalMeta(front);
    appendArticleMeta(front.ele('article-meta'), artigo, json);
    const body = article.ele('body');
    appendBlocks(body, (_a = json.body) !== null && _a !== void 0 ? _a : []);
    const back = article.ele('back');
    appendFootnotes(back, (_b = json.footnotes) !== null && _b !== void 0 ? _b : []);
    appendBlocks(back, (_c = json.back_matter) !== null && _c !== void 0 ? _c : []);
    appendReferences(back, (_d = json.references) !== null && _d !== void 0 ? _d : []);
    return doc.end({ prettyPrint: true, indent: '  ' });
};
exports.buildJatsXml = buildJatsXml;
const appendJournalMeta = (front) => {
    const journal = front.ele('journal-meta');
    journal.ele('journal-id', { 'journal-id-type': 'publisher-id' }).txt(JOURNAL.publisherId);
    const titles = journal.ele('journal-title-group');
    titles.ele('journal-title').txt(JOURNAL.title);
    titles.ele('abbrev-journal-title', { 'abbrev-type': 'publisher' }).txt(JOURNAL.abbrev);
    journal.ele('issn', { 'pub-type': 'ppub' }).txt(JOURNAL.issnPpub);
    journal.ele('issn', { 'pub-type': 'epub' }).txt(JOURNAL.issnEpub);
    journal.ele('publisher').ele('publisher-name').txt(JOURNAL.publisher);
};
const appendArticleMeta = (meta, artigo, json) => {
    var _a;
    const doi = (artigo.doi || '').trim();
    if (doi) {
        meta.ele('article-id', { 'pub-id-type': 'doi' }).txt(doi.replace(/^https?:\/\/doi\.org\//i, ''));
    }
    const subject = artigo.dossie ? `Dossiê${artigo.secao && artigo.secao !== 'Artigo' ? ` ${artigo.secao}` : ''}` : artigo.secao || 'Artigo';
    meta
        .ele('article-categories')
        .ele('subj-group', { 'subj-group-type': 'heading' })
        .ele('subject')
        .txt(subject);
    const titleGroup = meta.ele('title-group');
    titleGroup.ele('article-title').txt((artigo.titulo || '').trim());
    if ((artigo.titulo_en || '').trim()) {
        titleGroup.ele('trans-title-group', { 'xml:lang': 'en' }).ele('trans-title').txt(artigo.titulo_en.trim());
    }
    if ((artigo.titulo_es || '').trim()) {
        titleGroup.ele('trans-title-group', { 'xml:lang': 'es' }).ele('trans-title').txt(artigo.titulo_es.trim());
    }
    appendContribs(meta, (_a = artigo.autores) !== null && _a !== void 0 ? _a : []);
    appendPubDates(meta, artigo);
    appendPages(meta, artigo);
    const permissions = meta.ele('permissions');
    permissions
        .ele('license', {
        'xmlns:xlink': XLINK_NS,
        'license-type': 'open-access',
        'xlink:href': LICENSE_HREF,
        'xml:lang': 'pt',
    })
        .ele('license-p')
        .txt(LICENSE_P);
    appendAbstractsAndKeywords(meta, artigo, json);
};
const appendContribs = (meta, autores) => {
    if (autores.length === 0) {
        return;
    }
    const group = meta.ele('contrib-group');
    autores.forEach((autor, index) => {
        const affId = `aff${index + 1}`;
        const contrib = group.ele('contrib', { 'contrib-type': 'author' });
        const orcid = normalizeOrcid(autor.orcid);
        if (orcid) {
            contrib.ele('contrib-id', { 'contrib-id-type': 'orcid' }).txt(orcid);
        }
        const { given, surname } = (0, exports.splitPersonName)(autor.nome || '');
        const name = contrib.ele('name');
        name.ele('surname').txt(surname);
        if (given) {
            name.ele('given-names').txt(given);
        }
        contrib.ele('xref', { 'ref-type': 'aff', rid: affId }).txt(String(index + 1));
        const aff = meta.ele('aff', { id: affId });
        aff.ele('label').txt(String(index + 1));
        const parts = [autor.instituicao, autor.departamento].map((value) => (value || '').trim()).filter(Boolean);
        if (autor.instituicao) {
            aff.ele('institution', { 'content-type': 'orgname' }).txt(autor.instituicao.trim());
        }
        if (autor.departamento) {
            aff.ele('institution', { 'content-type': 'orgdiv1' }).txt(autor.departamento.trim());
        }
        if (autor.email) {
            aff.ele('email').txt(autor.email.trim());
        }
        if (parts.length > 0) {
            aff.ele('institution', { 'content-type': 'original' }).txt(parts.join(' / '));
        }
    });
};
const appendPubDates = (meta, artigo) => {
    var _a, _b, _c;
    const raw = artigo.data_de_publicacao || ((_a = artigo.edicao) === null || _a === void 0 ? void 0 : _a.data_de_publicacao);
    const parsed = parseIsoDate(raw);
    if (parsed) {
        const pub = meta.ele('pub-date', { 'date-type': 'pub', 'publication-format': 'electronic' });
        appendDateParts(pub, parsed);
        meta.ele('pub-date', { 'date-type': 'collection', 'publication-format': 'electronic' }).ele('year').txt(parsed.year);
    }
    if (((_b = artigo.edicao) === null || _b === void 0 ? void 0 : _b.volume) != null) {
        meta.ele('volume').txt(String(artigo.edicao.volume));
    }
    if (((_c = artigo.edicao) === null || _c === void 0 ? void 0 : _c.numero) != null) {
        meta.ele('issue').txt(String(artigo.edicao.numero));
    }
};
const appendPages = (meta, artigo) => {
    if (artigo.pagina_inicial != null) {
        meta.ele('fpage').txt(String(artigo.pagina_inicial));
    }
    if (artigo.pagina_final != null) {
        meta.ele('lpage').txt(String(artigo.pagina_final));
    }
};
const appendAbstractsAndKeywords = (meta, artigo, json) => {
    var _a, _b, _c, _d, _e, _f;
    const ptAbstract = firstNonEmpty((0, exports.flattenBlocks)(artigo.resumo), asPlain((_a = json.abstracts) === null || _a === void 0 ? void 0 : _a.portuguese));
    const enAbstract = firstNonEmpty((0, exports.flattenBlocks)(artigo.resumo_en), asPlain((_b = json.abstracts) === null || _b === void 0 ? void 0 : _b.english));
    const esAbstract = firstNonEmpty((0, exports.flattenBlocks)(artigo.resumo_es), asPlain((_c = json.abstracts) === null || _c === void 0 ? void 0 : _c.spanish));
    const ptKeywords = firstKeywordList(keywordsFromCms(artigo.palavras_chave), asKeywordList((_d = json.keywords) === null || _d === void 0 ? void 0 : _d.portuguese));
    const enKeywords = asKeywordList((_e = json.keywords) === null || _e === void 0 ? void 0 : _e.english);
    const esKeywords = asKeywordList((_f = json.keywords) === null || _f === void 0 ? void 0 : _f.spanish);
    appendAbstract(meta, 'abstract', 'pt', ptAbstract);
    appendAbstract(meta, 'trans-abstract', 'en', enAbstract);
    appendAbstract(meta, 'trans-abstract', 'es', esAbstract);
    appendKwdGroup(meta, 'pt', ptKeywords);
    appendKwdGroup(meta, 'en', enKeywords);
    appendKwdGroup(meta, 'es', esKeywords);
};
const appendAbstract = (meta, tag, lang, text) => {
    if (!text) {
        return;
    }
    const el = tag === 'abstract' ? meta.ele(tag) : meta.ele(tag, { 'xml:lang': lang });
    el.ele('title').txt(ABSTRACT_TITLES[lang] || 'RESUMO');
    const p = el.ele('p');
    (0, exports.appendMixed)(p, text);
};
const appendKwdGroup = (meta, lang, keywords) => {
    if (keywords.length === 0) {
        return;
    }
    const group = meta.ele('kwd-group', { 'xml:lang': lang });
    group.ele('title').txt(KWD_TITLES[lang] || 'Palavras-chave');
    keywords.forEach((keyword) => group.ele('kwd').txt(keyword));
};
const appendBlocks = (parent, items) => {
    items.forEach((item) => appendBlock(parent, item));
};
const appendBlock = (parent, item) => {
    if (typeof item === 'string') {
        const text = item.trim();
        if (!text) {
            return;
        }
        const p = parent.ele('p');
        (0, exports.appendMixed)(p, text);
        return;
    }
    if (!item || typeof item !== 'object') {
        return;
    }
    const obj = item;
    if (obj.type === 'figure') {
        appendFigure(parent, obj);
        return;
    }
    if (obj.type === 'table') {
        appendTable(parent, obj);
        return;
    }
    if (obj.type === 'quote') {
        const quote = parent.ele('disp-quote').ele('p');
        (0, exports.appendMixed)(quote, asPlain(obj.text));
        return;
    }
    if (obj.type === 'verse-group' && Array.isArray(obj.lines)) {
        const group = parent.ele('verse-group');
        obj.lines.forEach((line) => {
            const verseLine = group.ele('verse-line');
            (0, exports.appendMixed)(verseLine, asPlain(line));
        });
        return;
    }
    if (typeof obj.title === 'string' && Array.isArray(obj.paragraphs)) {
        const sec = parent.ele('sec');
        const title = sec.ele('title');
        (0, exports.appendMixed)(title, obj.title);
        appendBlocks(sec, obj.paragraphs);
        return;
    }
    if (typeof obj.text === 'string') {
        const p = parent.ele('p');
        (0, exports.appendMixed)(p, obj.text);
    }
};
const appendFigure = (parent, obj) => {
    const p = parent.ele('p');
    const fig = p.ele('fig', { id: (0, exports.toSpsId)('figure', String(obj.id || '')) });
    if (asPlain(obj.label)) {
        fig.ele('label').txt(asPlain(obj.label));
    }
    if (asPlain(obj.caption)) {
        const caption = fig.ele('caption').ele('title');
        (0, exports.appendMixed)(caption, asPlain(obj.caption));
    }
    const href = (0, exports.graphicBasename)(asPlain(obj.graphic));
    if (href) {
        fig.ele('graphic', { 'xmlns:xlink': XLINK_NS, 'xlink:href': href });
    }
    if (asPlain(obj.attrib)) {
        const attrib = fig.ele('attrib');
        (0, exports.appendMixed)(attrib, asPlain(obj.attrib));
    }
};
const appendTable = (parent, obj) => {
    const wrap = parent.ele('table-wrap', { id: (0, exports.toSpsId)('table', String(obj.id || '')) });
    if (asPlain(obj.label)) {
        wrap.ele('label').txt(asPlain(obj.label));
    }
    if (asPlain(obj.caption)) {
        const caption = wrap.ele('caption').ele('title');
        (0, exports.appendMixed)(caption, asPlain(obj.caption));
    }
    const tableData = (obj.table || {});
    const table = wrap.ele('table');
    appendTableSection(table, 'thead', tableData.thead);
    appendTableSection(table, 'tbody', tableData.tbody);
    if (asPlain(obj.attrib)) {
        const attrib = wrap.ele('table-wrap-foot').ele('attrib');
        (0, exports.appendMixed)(attrib, asPlain(obj.attrib));
    }
};
const appendTableSection = (table, tag, rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return;
    }
    const section = table.ele(tag);
    rows.forEach((row) => {
        const cells = row === null || row === void 0 ? void 0 : row.tr;
        if (!Array.isArray(cells)) {
            return;
        }
        const tr = section.ele('tr');
        cells.forEach((cell) => {
            const data = (cell || {});
            const cellTag = data.tag === 'th' ? 'th' : 'td';
            const attrs = {};
            if (data.rowspan && data.rowspan > 1) {
                attrs.rowspan = String(data.rowspan);
            }
            if (data.colspan && data.colspan > 1) {
                attrs.colspan = String(data.colspan);
            }
            const el = tr.ele(cellTag, attrs);
            (0, exports.appendMixed)(el, asPlain(data.text));
        });
    });
};
const appendFootnotes = (back, footnotes) => {
    if (footnotes.length === 0) {
        return;
    }
    const group = back.ele('fn-group');
    footnotes.forEach((fn, index) => {
        const spsId = (0, exports.toSpsId)('footnote', fn.id || String(index + 1));
        const label = spsId.replace(/^fn/i, '') || String(index + 1);
        const node = group.ele('fn', { 'fn-type': 'other', id: spsId });
        node.ele('label').txt(label);
        const p = node.ele('p');
        (0, exports.appendMixed)(p, asPlain(fn.text));
    });
};
const appendReferences = (back, references) => {
    if (references.length === 0) {
        return;
    }
    const list = back.ele('ref-list');
    list.ele('title').txt('Referências');
    references.forEach((ref, index) => {
        const node = list.ele('ref', { id: (0, exports.toSpsId)('reference', ref.id || String(index + 1)) });
        const mixed = node.ele('mixed-citation');
        (0, exports.appendMixed)(mixed, asPlain(ref.text));
    });
};
const appendMixed = (parent, text) => {
    if (!text) {
        return;
    }
    MD_LINK_RE.lastIndex = 0;
    let last = 0;
    let match;
    while ((match = MD_LINK_RE.exec(text))) {
        if (match.index > last) {
            appendTextWithUrls(parent, text.slice(last, match.index));
        }
        const [, label, kind, num] = match;
        const mapped = (0, exports.mapMarkdownTarget)(kind, num);
        const xref = parent.ele('xref', { 'ref-type': mapped.refType, rid: mapped.rid });
        if (mapped.refType === 'fn') {
            xref.ele('sup').txt(label);
        }
        else {
            xref.txt(label);
        }
        last = match.index + match[0].length;
    }
    if (last < text.length) {
        appendTextWithUrls(parent, text.slice(last));
    }
};
exports.appendMixed = appendMixed;
const appendTextWithUrls = (parent, text) => {
    if (!text) {
        return;
    }
    URL_RE.lastIndex = 0;
    let last = 0;
    let match;
    while ((match = URL_RE.exec(text))) {
        if (match.index > last) {
            parent.txt(text.slice(last, match.index));
        }
        const href = match[1];
        parent.ele('ext-link', { 'ext-link-type': 'uri', 'xmlns:xlink': XLINK_NS, 'xlink:href': href }).txt(href);
        last = match.index + match[0].length;
    }
    if (last < text.length) {
        parent.txt(text.slice(last));
    }
};
const mapMarkdownTarget = (kind, num) => {
    switch (kind.toLowerCase()) {
        case 'reference':
            return { refType: 'bibr', rid: `B${num}` };
        case 'footnote':
            return { refType: 'fn', rid: `fn${num}` };
        case 'figure':
            return { refType: 'fig', rid: `f${num}` };
        case 'table':
            return { refType: 'table', rid: `t${num}` };
        default:
            return { refType: 'bibr', rid: `${kind}-${num}` };
    }
};
exports.mapMarkdownTarget = mapMarkdownTarget;
const toSpsId = (kind, raw) => {
    const match = String(raw).match(/(\d+)\s*$/);
    const num = match ? match[1] : raw.replace(/^[^\d]+/, '') || '1';
    switch (kind) {
        case 'reference':
            return `B${num}`;
        case 'footnote':
            return `fn${num}`;
        case 'figure':
            return `f${num}`;
        case 'table':
            return `t${num}`;
        default:
            return raw;
    }
};
exports.toSpsId = toSpsId;
const graphicBasename = (graphic) => graphic.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
exports.graphicBasename = graphicBasename;
const splitPersonName = (full) => {
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return { given: '', surname: '' };
    }
    if (parts.length === 1) {
        return { given: '', surname: parts[0] };
    }
    let index = parts.length - 1;
    while (index > 1 && NAME_PARTICLES.has(parts[index - 1].toLowerCase())) {
        index -= 1;
    }
    return { given: parts.slice(0, index).join(' '), surname: parts.slice(index).join(' ') };
};
exports.splitPersonName = splitPersonName;
const flattenBlocks = (value) => {
    if (!value) {
        return '';
    }
    if (typeof value === 'string') {
        return value.trim();
    }
    if (Array.isArray(value)) {
        return value.map(exports.flattenBlocks).filter(Boolean).join('\n').trim();
    }
    if (typeof value === 'object') {
        const node = value;
        if (typeof node.text === 'string') {
            return node.text;
        }
        if (node.children) {
            return (0, exports.flattenBlocks)(node.children);
        }
    }
    return '';
};
exports.flattenBlocks = flattenBlocks;
const asPlain = (value) => {
    if (value == null) {
        return '';
    }
    if (typeof value === 'string') {
        return value.trim();
    }
    if (Array.isArray(value)) {
        return value.map(asPlain).filter(Boolean).join('\n').trim();
    }
    return String(value).trim();
};
const asKeywordList = (value) => {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.map(asPlain).filter(Boolean);
    }
    return asPlain(value)
        .split(/[;,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
};
const keywordsFromCms = (value) => {
    if (!value) {
        return [];
    }
    return value
        .map((item) => (typeof item === 'string' ? item : (item === null || item === void 0 ? void 0 : item.texto) || ''))
        .map((item) => item.trim())
        .filter(Boolean);
};
const firstNonEmpty = (...values) => values.find((value) => Boolean(value.trim())) || '';
const firstKeywordList = (...lists) => lists.find((list) => list.length > 0) || [];
const normalizeOrcid = (raw) => {
    if (!raw) {
        return null;
    }
    const match = raw.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i);
    return match ? match[1].toUpperCase() : null;
};
const parseIsoDate = (raw) => {
    if (!raw) {
        return null;
    }
    const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
        return null;
    }
    return { year: match[1], month: match[2], day: match[3] };
};
const appendDateParts = (parent, date) => {
    parent.ele('day').txt(date.day);
    parent.ele('month').txt(date.month);
    parent.ele('year').txt(date.year);
};
