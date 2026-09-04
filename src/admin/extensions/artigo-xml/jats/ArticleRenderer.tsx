import * as React from 'react';

import { renderInlineNodes } from './inline';
import { renderBlockNodes } from './blocks';
import {
  AbstractBlock,
  AffiliationsList,
  ArticleContainer,
  AuthorsLine,
  BackSection,
  Eyebrow,
  FootnoteEntry,
  FootnoteLabel,
  KeywordsLine,
  MetaFooter,
  ReferenceEntry,
  TransTitle,
} from './styles';

export class JatsParseError extends Error {}

/**
 * Parses raw XML text into a JATS `<article>` DOM Document, throwing
 * `JatsParseError` when the content isn't a well-formed JATS article so
 * callers can fall back to a raw text view.
 */
export const parseJatsXml = (xml: string): Document => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  if (doc.querySelector('parsererror')) {
    throw new JatsParseError('O arquivo não é um XML bem formado.');
  }

  if (doc.documentElement?.tagName.toLowerCase() !== 'article') {
    throw new JatsParseError('O XML não parece ser um artigo no padrão JATS.');
  }

  return doc;
};

const qs = (root: Element | Document | null | undefined, selector: string): Element | null =>
  root ? root.querySelector(selector) : null;

const qsa = (root: Element | Document | null | undefined, selector: string): Element[] =>
  root ? Array.from(root.querySelectorAll(selector)) : [];

const directChildren = (el: Element | null | undefined, tagName: string): Element[] =>
  el ? Array.from(el.children).filter((c) => c.tagName.toLowerCase() === tagName) : [];

const directChild = (el: Element | null | undefined, tagName: string): Element | null =>
  directChildren(el, tagName)[0] ?? null;

const langOf = (el: Element): string | null =>
  el.getAttribute('xml:lang') ||
  el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang');

const textOf = (el: Element | null | undefined): string => el?.textContent?.trim() ?? '';

interface ArticleRendererProps {
  xml: string;
  /** Called when the XML can't be parsed as a JATS article, so the page can fall back to a raw view. */
  onParseError?: (error: Error) => void;
}

/**
 * Renders a JATS/SciELO article XML as a readable, paper-like document:
 * title, authors, affiliations, abstracts, body sections, footnotes and
 * references. Figure `xlink:href`s are resolved against the article's uploaded
 * images by `FigureAssetsContext`; absolute URLs are used as-is and require CSP
 * to allow them.
 */
export const ArticleRenderer: React.FC<ArticleRendererProps> = ({ xml, onParseError }) => {
  const parsed = React.useMemo((): { doc: Document | null; error: Error | null } => {
    try {
      return { doc: parseJatsXml(xml), error: null };
    } catch (error) {
      return { doc: null, error: error as Error };
    }
  }, [xml]);

  React.useEffect(() => {
    if (parsed.error) {
      onParseError?.(parsed.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.error]);

  if (!parsed.doc) {
    return null;
  }

  return <Article doc={parsed.doc} />;
};

const Article: React.FC<{ doc: Document }> = ({ doc }) => {
  const article = doc.documentElement;
  const rootLang = langOf(article) || 'en';
  const meta = qs(doc, 'front > article-meta');
  const body = qs(doc, 'body');
  const back = qs(doc, 'back');

  const eyebrow = textOf(qs(meta, 'article-categories subj-group subject'));
  const titleEl = qs(meta, 'title-group > article-title');
  const transTitles = qsa(meta, 'title-group > trans-title-group').map((group) => ({
    lang: langOf(group),
    titleEl: directChild(group, 'trans-title'),
  }));

  const affiliations = directChildren(meta, 'aff');
  const authors = qsa(meta, 'contrib-group > contrib').map((contrib) => {
    const nameEl = directChild(contrib, 'name');
    const surname = textOf(directChild(nameEl, 'surname'));
    const given = textOf(directChild(nameEl, 'given-names'));
    const stringName = textOf(directChild(contrib, 'string-name'));
    const displayName = given || surname ? [given, surname].filter(Boolean).join(' ') : stringName;
    const markers = qsa(contrib, 'xref[ref-type="aff"]').map((x) => textOf(x));
    return { displayName, markers };
  });

  const abstracts = [
    { lang: rootLang, el: directChild(meta, 'abstract') },
    ...directChildren(meta, 'trans-abstract').map((el) => ({ lang: langOf(el), el })),
  ].filter((a): a is { lang: string; el: Element } => Boolean(a.el));

  const kwdGroups = directChildren(meta, 'kwd-group');

  const ackEl = directChild(back, 'ack');
  const fundingStatementEl = qs(meta, 'funding-group > funding-statement');

  const fnGroups = directChildren(back, 'fn-group');
  const refListEl = directChild(back, 'ref-list');
  const refs = refListEl ? directChildren(refListEl, 'ref') : [];

  const receivedDate = qs(meta, 'history > date[date-type="received"]');
  const acceptedDate = qs(meta, 'history > date[date-type="accepted"]');
  const editedByFn = qs(meta, 'author-notes > fn[fn-type="edited-by"]');

  return (
    <ArticleContainer>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}

      {titleEl && <h1>{renderInlineNodes(titleEl.childNodes, 'title')}</h1>}
      {transTitles.map(
        ({ lang, titleEl: tEl }, index) =>
          tEl && (
            <TransTitle key={`trans-title-${index}`} lang={lang || undefined}>
              {renderInlineNodes(tEl.childNodes, `trans-title-${index}`)}
            </TransTitle>
          )
      )}

      {authors.length > 0 && (
        <AuthorsLine>
          {authors.map((author, index) => (
            <React.Fragment key={`author-${index}`}>
              {index > 0 && '; '}
              {author.displayName}
              {author.markers.map((marker, mIndex) => (
                <sup key={`author-${index}-marker-${mIndex}`}>{marker}</sup>
              ))}
            </React.Fragment>
          ))}
        </AuthorsLine>
      )}

      {affiliations.length > 0 && (
        <AffiliationsList>
          {affiliations.map((aff, index) => {
            const label = textOf(directChild(aff, 'label'));
            const original = textOf(qs(aff, 'institution[content-type="original"]'));
            const institutions = directChildren(aff, 'institution')
              .filter((inst) => inst.getAttribute('content-type') !== 'original')
              .map((inst) => textOf(inst))
              .filter(Boolean)
              .join(' / ');
            const email = textOf(directChild(aff, 'email'));
            const description = original || institutions;
            return (
              <p key={`aff-${index}`}>
                {label && <sup>{label}</sup>} {description}
                {email && <> – E-mail: {email}</>}
              </p>
            );
          })}
        </AffiliationsList>
      )}

      {abstracts.map(({ lang, el }, index) => {
        const abstractTitleEl = directChild(el, 'title');
        const paragraphs = directChildren(el, 'p');
        const kwdGroup = kwdGroups.find((g) => langOf(g) === lang) ?? null;
        const kwdTitle = textOf(directChild(kwdGroup, 'title'));
        const kwds = kwdGroup ? directChildren(kwdGroup, 'kwd').map((k) => textOf(k)) : [];

        return (
          <AbstractBlock key={`abstract-${index}`} lang={lang || undefined}>
            {abstractTitleEl && <h4>{renderInlineNodes(abstractTitleEl.childNodes, `abstract-${index}-title`)}</h4>}
            {paragraphs.map((p, pIndex) => (
              <p key={`abstract-${index}-p-${pIndex}`}>
                {renderInlineNodes(p.childNodes, `abstract-${index}-p-${pIndex}`)}
              </p>
            ))}
            {kwds.length > 0 && (
              <KeywordsLine>
                {kwdTitle && <strong>{kwdTitle}</strong>}
                {kwds.join('; ')}
              </KeywordsLine>
            )}
          </AbstractBlock>
        );
      })}

      {body && renderBlockNodes(body.childNodes, 'body', 2)}

      {(ackEl || fundingStatementEl) && (
        <section>
          <h2>{textOf(directChild(ackEl, 'title')) || 'Financiamento'}</h2>
          {ackEl
            ? renderBlockNodes(
                Array.from(ackEl.childNodes).filter(
                  (n) => !(n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName.toLowerCase() === 'title')
                ),
                'ack',
                3
              )
            : fundingStatementEl && <p>{renderInlineNodes(fundingStatementEl.childNodes, 'funding')}</p>}
        </section>
      )}

      {fnGroups.length > 0 && (
        <BackSection>
          <h2>Notas</h2>
          {fnGroups.flatMap((group) => directChildren(group, 'fn')).map((fn, index) => {
            const label = textOf(directChild(fn, 'label')) || String(index + 1);
            const contentNodes = Array.from(fn.childNodes).filter(
              (n) => !(n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName.toLowerCase() === 'label')
            );
            return (
              <FootnoteEntry key={fn.getAttribute('id') || `fn-${index}`} id={fn.getAttribute('id') || undefined}>
                <FootnoteLabel>{label}.</FootnoteLabel>
                <div>{renderBlockNodes(contentNodes, `fn-${index}`, 6)}</div>
              </FootnoteEntry>
            );
          })}
        </BackSection>
      )}

      {refs.length > 0 && (
        <BackSection>
          <h2>{textOf(directChild(refListEl, 'title')) || 'Referências'}</h2>
          {refs.map((ref, index) => {
            const mixed = directChild(ref, 'mixed-citation');
            const id = ref.getAttribute('id') || `ref-${index}`;
            if (mixed) {
              return (
                <ReferenceEntry key={id} id={id}>
                  {renderInlineNodes(mixed.childNodes, `ref-${index}`)}
                </ReferenceEntry>
              );
            }
            return (
              <ReferenceEntry key={id} id={id}>
                {renderElementCitationFallback(directChild(ref, 'element-citation'))}
              </ReferenceEntry>
            );
          })}
        </BackSection>
      )}

      {(receivedDate || acceptedDate || editedByFn) && (
        <MetaFooter>
          {receivedDate && <>Recebido em: {formatJatsDate(receivedDate)}</>}
          {receivedDate && acceptedDate && ' – '}
          {acceptedDate && <>Aprovado em: {formatJatsDate(acceptedDate)}</>}
          {editedByFn && (
            <>
              <br />
              {formatEditedBy(editedByFn)}
            </>
          )}
        </MetaFooter>
      )}
    </ArticleContainer>
  );
};

const formatEditedBy = (fn: Element): string => {
  const label = textOf(directChild(fn, 'label'));
  const paragraphs = directChildren(fn, 'p')
    .map((p) => textOf(p))
    .filter(Boolean);
  const body = paragraphs.join(' ');
  if (label) {
    return body ? `${label} ${body}` : label;
  }
  return body || 'Editores responsáveis:';
};

const formatJatsDate = (dateEl: Element): string => {
  const day = textOf(directChild(dateEl, 'day'));
  const month = textOf(directChild(dateEl, 'month'));
  const year = textOf(directChild(dateEl, 'year'));
  return [day, month, year].filter(Boolean).join('/');
};

const renderElementCitationFallback = (el: Element | null): React.ReactNode => {
  if (!el) {
    return null;
  }

  const authors = qsa(el, 'person-group > name')
    .map((n) => [textOf(directChild(n, 'surname')), textOf(directChild(n, 'given-names'))].filter(Boolean).join(', '))
    .join('; ');
  const articleTitle = textOf(directChild(el, 'article-title'));
  const source = textOf(directChild(el, 'source'));
  const year = textOf(directChild(el, 'year'));

  return [authors, articleTitle, source, year].filter(Boolean).join('. ');
};
