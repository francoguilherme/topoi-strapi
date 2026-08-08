import styled, { keyframes } from 'styled-components';

/** Brief highlight flash used to draw attention to a footnote/reference when it becomes the URL's target. */
const targetHighlight = keyframes`
  from {
    background-color: #fff3bf;
  }
  to {
    background-color: transparent;
  }
`;

/**
 * Reading-focused, paper-like presentation for a rendered JATS article.
 * Scoped to this container so it never leaks into the rest of the admin UI.
 */
export const ArticleContainer = styled.div`
  max-width: 820px;
  margin: 0 auto;
  font-family: Georgia, 'Times New Roman', Times, serif;
  color: #1a1a1a;
  line-height: 1.65;
  font-size: 16px;

  h1,
  h2,
  h3,
  h4 {
    color: #212134;
    line-height: 1.3;
  }

  h1 {
    font-size: 1.6rem;
    margin: 0 0 0.5em;
  }

  h2 {
    font-size: 1.25rem;
    margin: 1.75em 0 0.75em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #eaeaef;
  }

  h3 {
    font-size: 1.05rem;
    margin: 1.5em 0 0.5em;
  }

  h4 {
    font-size: 1rem;
    margin: 1.25em 0 0.5em;
  }

  section > h2,
  section > h3,
  section > h4 {
    font-weight: 600;
  }

  section > h2 {
    font-size: 1.7rem;
  }

  section > h3 {
    font-size: 1.15rem;
  }

  section > h4 {
    font-size: 1.075rem;
  }

  p {
    text-align: justify;
    margin: 0 0 1em;
  }

  a.jats-xref {
    color: #4945ff;
    text-decoration: none;
  }

  a.jats-xref:hover {
    text-decoration: underline;
  }

  sup,
  sub {
    line-height: 0;
  }
`;

export const Eyebrow = styled.p`
  text-align: left !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.8rem;
  color: #666687;
  margin: 0 0 0.5em !important;
`;

export const TransTitle = styled.p`
  text-align: left !important;
  font-style: italic;
  color: #4a4a6a;
  font-size: 1rem;
  margin: 0.25em 0 !important;
`;

export const AuthorsLine = styled.p`
  text-align: left !important;
  font-weight: 600;
  margin: 1em 0 0.25em !important;
`;

export const AffiliationsList = styled.div`
  font-size: 0.85rem;
  color: #444;
  margin-bottom: 1.5em;

  p {
    text-align: left;
    margin: 0.15em 0;
  }
`;

export const AbstractBlock = styled.div`
  margin: 1em 0;
  padding: 1em 1.25em;
  background: #fafafb;
  border: 1px solid #eaeaef;
  border-radius: 4px;

  p {
    margin-bottom: 0.5em;
  }
`;

export const KeywordsLine = styled.p`
  text-align: left !important;
  font-size: 0.95rem;
  margin: 0 !important;

  strong {
    margin-right: 0.35em;
  }
`;

export const Blockquote = styled.blockquote`
  margin: 1em 2em;
  padding-left: 1em;
  border-left: 3px solid #dcdce4;
  color: #32324d;
  font-size: 1em;

  p {
    text-align: left;
  }
`;

export const BoxedText = styled.div`
  margin: 1em 0;
  padding: 1em 1.25em;
  border: 1px solid #eaeaef;
  border-radius: 4px;
  background: #fbfbfc;
`;

export const TableWrapper = styled.div`
  margin: 1.5em 0;

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th,
  td {
    border: 1px solid #dcdce4;
    padding: 6px 10px;
  }

  thead th {
    background: #f6f6f9;
    font-weight: 600;
  }
`;

export const CaptionHeading = styled.p`
  text-align: left !important;
  font-weight: 600;
  margin: 0 0 0.5em !important;
`;

export const AttribText = styled.p`
  text-align: left !important;
  font-size: 0.85rem;
  color: #666687;
  font-style: italic;
  margin: 0.5em 0 0 !important;
`;

export const FigureWrapper = styled.figure`
  margin: 1.5em 0;
  text-align: center;

  img {
    max-width: 100%;
    border: 1px solid #eaeaef;
  }
`;

export const BackSection = styled.div`
  margin-top: 2.5em;
  padding-top: 1em;
  border-top: 2px solid #eaeaef;

  h2 {
    font-size: 1.7rem;
    font-weight: 600;
  }
`;

export const FootnoteEntry = styled.div`
  display: flex;
  gap: 0.5em;
  margin-bottom: 0.75em;
  padding: 0.3em 0.4em;
  border-radius: 4px;
  font-size: 1.5rem;
  scroll-margin-top: 1em;

  p {
    text-align: left;
    margin: 0;
  }

  &:target {
    animation: ${targetHighlight} 2.5s ease-out;
  }
`;

export const FootnoteLabel = styled.span`
  font-weight: 600;
  flex-shrink: 0;
`;

export const ReferenceEntry = styled.p`
  text-align: left !important;
  margin: 0 0 0.85em !important;
  font-size: 1.5rem;
  padding-left: 1.5em;
  text-indent: -1.5em;
  scroll-margin-top: 1em;
  border-radius: 4px;

  &:target {
    animation: ${targetHighlight} 2.5s ease-out;
  }
`;

export const MetaFooter = styled.p`
  text-align: left !important;
  font-size: 0.85rem;
  color: #666687;
  margin-top: 2em !important;
`;

/** Section `<title>` heading — slightly larger than body text, scaled by nesting depth. */
export const SectionHeading = styled.h2<{ $depth: number }>`
  color: #212134;
  line-height: 1.3;
  font-weight: 600;
  font-size: ${({ $depth }) => ($depth <= 2 ? '1.3rem' : $depth === 3 ? '1.15rem' : '1.075rem')};
  margin: ${({ $depth }) =>
    $depth <= 2 ? '1.75em 0 0.75em' : $depth === 3 ? '1.5em 0 0.5em' : '1.25em 0 0.5em'};
  padding-bottom: ${({ $depth }) => ($depth <= 2 ? '0.3em' : '0')};
  border-bottom: ${({ $depth }) => ($depth <= 2 ? '1px solid #eaeaef' : 'none')};
`;
