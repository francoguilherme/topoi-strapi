import * as React from 'react';
import { Box, Checkbox, Flex, Typography } from '@strapi/design-system';

import {
  directChild,
  directChildren,
  ensureChild,
  getElementKey,
  getLang,
  moveElement,
  removeElement,
  setAttr,
  setLang,
  setPlainText,
} from './domMutations';
import { InlineRichEditor } from './InlineRichEditor';
import { AddButton, FieldGroup, ItemCard, ItemToolbar, LabeledInput } from './fieldUi';

interface SectionProps {
  doc: Document;
  commit: () => void;
}

const ensureFront = (article: Element): Element => {
  const existing = directChild(article, 'front');
  if (existing) {
    return existing;
  }
  const before = directChild(article, 'body') || directChild(article, 'back') || null;
  return ensureChild(article, 'front', { before });
};

/**
 * Front-matter (title, authors, affiliations, abstracts, keywords, funding, dates)
 * editing, organized as a handful of self-contained sub-forms. Every field reads from
 * and writes directly into the shared `doc`; `commit()` is called after each change to
 * re-serialize the document into `draftXml`.
 */
export const MetadataFields: React.FC<SectionProps> = ({ doc, commit }) => {
  const article = doc.documentElement;
  const front = ensureFront(article);
  const meta = ensureChild(front, 'article-meta');
  const rootLang = getLang(article) || 'en';

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <TitleSection meta={meta} doc={doc} commit={commit} />
      <AuthorsSection meta={meta} doc={doc} commit={commit} />
      <AbstractsSection meta={meta} doc={doc} commit={commit} rootLang={rootLang} />
      <FundingSection meta={meta} doc={doc} commit={commit} />
      <DatesSection meta={meta} doc={doc} commit={commit} />
    </Flex>
  );
};

const TitleSection: React.FC<SectionProps & { meta: Element }> = ({ meta, doc, commit }) => {
  const titleGroup = ensureChild(meta, 'title-group');
  const titleEl = ensureChild(titleGroup, 'article-title');
  const transGroups = directChildren(titleGroup, 'trans-title-group');

  const addTransTitle = () => {
    const group = doc.createElement('trans-title-group');
    setLang(group, 'pt');
    group.appendChild(doc.createElement('trans-title'));
    titleGroup.appendChild(group);
    commit();
  };

  return (
    <FieldGroup title="Título">
      <Box>
        <Typography variant="pi" fontWeight="semiBold">
          Título principal
        </Typography>
        <InlineRichEditor
          key={getElementKey(titleEl)}
          doc={doc}
          initialNodes={titleEl.childNodes}
          onChange={(nodes) => titleEl.replaceChildren(...nodes)}
          onBlur={commit}
        />
      </Box>

      {transGroups.map((group) => {
        const transTitleEl = ensureChild(group, 'trans-title');
        return (
          <ItemCard key={getElementKey(group)}>
            <Flex direction="column" alignItems="stretch" gap={2}>
              <Flex justifyContent="space-between" alignItems="flex-start">
                <Box width="120px">
                  <LabeledInput
                    label="Idioma"
                    value={getLang(group)}
                    onChange={(value) => {
                      setLang(group, value);
                      commit();
                    }}
                  />
                </Box>
                <ItemToolbar
                  onRemove={() => {
                    removeElement(group);
                    commit();
                  }}
                  removeLabel="Remover título traduzido"
                />
              </Flex>
              <InlineRichEditor
                key={getElementKey(transTitleEl)}
                doc={doc}
                initialNodes={transTitleEl.childNodes}
                onChange={(nodes) => transTitleEl.replaceChildren(...nodes)}
                onBlur={commit}
              />
            </Flex>
          </ItemCard>
        );
      })}

      <AddButton label="Adicionar título traduzido" onClick={addTransTitle} />
    </FieldGroup>
  );
};

const AuthorsSection: React.FC<SectionProps & { meta: Element }> = ({ meta, doc, commit }) => {
  const contribGroup = ensureChild(meta, 'contrib-group');
  const contribs = directChildren(contribGroup, 'contrib');
  const affiliations = directChildren(meta, 'aff');

  const addAuthor = () => {
    const contrib = doc.createElement('contrib');
    contrib.setAttribute('contrib-type', 'author');
    const name = doc.createElement('name');
    name.appendChild(doc.createElement('surname'));
    name.appendChild(doc.createElement('given-names'));
    contrib.appendChild(name);
    contribGroup.appendChild(contrib);
    commit();
  };

  const addAffiliation = () => {
    const aff = doc.createElement('aff');
    setAttr(aff, 'id', `aff${affiliations.length + 1}`);
    const label = doc.createElement('label');
    label.textContent = String(affiliations.length + 1);
    aff.appendChild(label);
    const institution = doc.createElement('institution');
    institution.setAttribute('content-type', 'original');
    aff.appendChild(institution);
    meta.appendChild(aff);
    commit();
  };

  return (
    <FieldGroup title="Autores e afiliações">
      <Typography variant="sigma" textColor="neutral600">
        Autores
      </Typography>
      <Flex direction="column" alignItems="stretch" gap={2}>
        {contribs.map((contrib) => (
          <AuthorRow
            key={getElementKey(contrib)}
            contrib={contrib}
            affiliations={affiliations}
            doc={doc}
            commit={commit}
          />
        ))}
      </Flex>
      <AddButton label="Adicionar autor" onClick={addAuthor} />

      <Typography variant="sigma" textColor="neutral600">
        Afiliações
      </Typography>
      <Flex direction="column" alignItems="stretch" gap={2}>
        {affiliations.map((aff) => (
          <AffiliationRow key={getElementKey(aff)} aff={aff} commit={commit} />
        ))}
      </Flex>
      <AddButton label="Adicionar afiliação" onClick={addAffiliation} />
    </FieldGroup>
  );
};

const AuthorRow: React.FC<{
  contrib: Element;
  affiliations: Element[];
  doc: Document;
  commit: () => void;
}> = ({ contrib, affiliations, doc, commit }) => {
  const nameEl = ensureChild(contrib, 'name');
  const surnameEl = ensureChild(nameEl, 'surname');
  const givenEl = ensureChild(nameEl, 'given-names');
  const markers = new Set(
    directChildren(contrib, 'xref')
      .filter((x) => x.getAttribute('ref-type') === 'aff')
      .map((x) => x.getAttribute('rid') || '')
  );

  const toggleAffiliation = (affId: string, checked: boolean) => {
    if (checked) {
      const aff = affiliations.find((a) => a.getAttribute('id') === affId);
      const xref = doc.createElement('xref');
      xref.setAttribute('ref-type', 'aff');
      xref.setAttribute('rid', affId);
      xref.textContent = directChild(aff, 'label')?.textContent || '';
      contrib.appendChild(xref);
    } else {
      directChildren(contrib, 'xref')
        .filter((x) => x.getAttribute('ref-type') === 'aff' && x.getAttribute('rid') === affId)
        .forEach((x) => removeElement(x));
    }
    commit();
  };

  return (
    <ItemCard>
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Flex gap={2} wrap="wrap">
          <Box style={{ flex: 1, minWidth: 160 }}>
            <LabeledInput
              label="Nome"
              value={givenEl.textContent || ''}
              onChange={(value) => setPlainText(givenEl, value)}
              onBlur={commit}
            />
          </Box>
          <Box style={{ flex: 1, minWidth: 160 }}>
            <LabeledInput
              label="Sobrenome"
              value={surnameEl.textContent || ''}
              onChange={(value) => setPlainText(surnameEl, value)}
              onBlur={commit}
            />
          </Box>
          <ItemToolbar
            onRemove={() => {
              removeElement(contrib);
              commit();
            }}
            removeLabel="Remover autor"
          />
        </Flex>
        {affiliations.length > 0 && (
          <Box>
            <Typography variant="pi" textColor="neutral600">
              Afiliações
            </Typography>
            <Flex gap={3} wrap="wrap">
              {affiliations.map((aff) => {
                const affId = aff.getAttribute('id') || '';
                const label = directChild(aff, 'label')?.textContent || affId;
                return (
                  <Checkbox
                    key={affId}
                    checked={markers.has(affId)}
                    onCheckedChange={(checked) => toggleAffiliation(affId, checked === true)}
                  >
                    {label}
                  </Checkbox>
                );
              })}
            </Flex>
          </Box>
        )}
      </Flex>
    </ItemCard>
  );
};

const AffiliationRow: React.FC<{ aff: Element; commit: () => void }> = ({ aff, commit }) => {
  const labelEl = ensureChild(aff, 'label');
  // `institution[content-type="original"]` can't be located with `ensureChild` (which only
  // matches by tag name), so it's found/created explicitly here instead.
  const originalInstitution =
    directChildren(aff, 'institution').find((i) => i.getAttribute('content-type') === 'original') ??
    (() => {
      const created = aff.ownerDocument.createElement('institution');
      created.setAttribute('content-type', 'original');
      aff.appendChild(created);
      return created;
    })();
  const emailEl = ensureChild(aff, 'email');

  return (
    <ItemCard>
      <Flex gap={2} wrap="wrap" alignItems="flex-end">
        <Box width="70px">
          <LabeledInput
            label="Marcador"
            value={labelEl.textContent || ''}
            onChange={(value) => setPlainText(labelEl, value)}
            onBlur={commit}
          />
        </Box>
        <Box style={{ flex: 2, minWidth: 220 }}>
          <LabeledInput
            label="Instituição"
            value={originalInstitution.textContent || ''}
            onChange={(value) => setPlainText(originalInstitution, value)}
            onBlur={commit}
          />
        </Box>
        <Box style={{ flex: 1, minWidth: 180 }}>
          <LabeledInput
            label="E-mail"
            value={emailEl.textContent || ''}
            onChange={(value) => setPlainText(emailEl, value)}
            onBlur={commit}
          />
        </Box>
        <ItemToolbar
          onRemove={() => {
            removeElement(aff);
            commit();
          }}
          removeLabel="Remover afiliação"
        />
      </Flex>
    </ItemCard>
  );
};

const AbstractsSection: React.FC<SectionProps & { meta: Element; rootLang: string }> = ({
  meta,
  doc,
  commit,
  rootLang,
}) => {
  const abstractEl = ensureChild(meta, 'abstract');
  const transAbstracts = directChildren(meta, 'trans-abstract');
  const kwdGroups = directChildren(meta, 'kwd-group');

  const addTransAbstract = () => {
    const el = doc.createElement('trans-abstract');
    setLang(el, 'pt');
    el.appendChild(doc.createElement('p'));
    meta.appendChild(el);
    commit();
  };

  const addKwdGroup = (lang: string) => {
    const group = doc.createElement('kwd-group');
    setLang(group, lang);
    meta.appendChild(group);
    commit();
  };

  return (
    <FieldGroup title="Resumos e palavras-chave">
      <AbstractBlock label={`Resumo (${rootLang})`} lang={rootLang} el={abstractEl} doc={doc} commit={commit} />
      <KwdGroupBlock lang={rootLang} meta={meta} kwdGroups={kwdGroups} doc={doc} commit={commit} onAdd={addKwdGroup} />

      {transAbstracts.map((el) => (
        <Box key={getElementKey(el)}>
          <Flex justifyContent="space-between" alignItems="flex-start">
            <Box width="120px">
              <LabeledInput
                label="Idioma do resumo"
                value={getLang(el)}
                onChange={(value) => {
                  setLang(el, value);
                  commit();
                }}
              />
            </Box>
            <ItemToolbar
              onRemove={() => {
                removeElement(el);
                commit();
              }}
              removeLabel="Remover resumo traduzido"
            />
          </Flex>
          <AbstractBlock label="" lang={getLang(el)} el={el} doc={doc} commit={commit} />
          <KwdGroupBlock
            lang={getLang(el)}
            meta={meta}
            kwdGroups={kwdGroups}
            doc={doc}
            commit={commit}
            onAdd={addKwdGroup}
          />
        </Box>
      ))}

      <AddButton label="Adicionar resumo traduzido" onClick={addTransAbstract} />
    </FieldGroup>
  );
};

const AbstractBlock: React.FC<{
  label: string;
  lang: string;
  el: Element;
  doc: Document;
  commit: () => void;
}> = ({ label, el, doc, commit }) => {
  const titleEl = directChild(el, 'title');
  const paragraphs = directChildren(el, 'p');

  const addParagraph = () => {
    el.appendChild(doc.createElement('p'));
    commit();
  };

  return (
    <Box>
      {label && (
        <Typography variant="pi" fontWeight="semiBold">
          {label}
        </Typography>
      )}
      <Flex direction="column" alignItems="stretch" gap={2}>
        <LabeledInput
          label="Título do resumo (opcional)"
          value={titleEl?.textContent || ''}
          onChange={(value) => setPlainText(ensureChild(el, 'title'), value)}
          onBlur={commit}
        />
        {paragraphs.map((p, index) => (
          <Flex key={getElementKey(p)} gap={2} alignItems="flex-start">
            <Box style={{ flex: 1 }}>
              <InlineRichEditor
                key={getElementKey(p)}
                doc={doc}
                initialNodes={p.childNodes}
                onChange={(nodes) => p.replaceChildren(...nodes)}
                onBlur={commit}
              />
            </Box>
            <ItemToolbar
              onMoveUp={
                index > 0
                  ? () => {
                      moveElement(p, 'up');
                      commit();
                    }
                  : undefined
              }
              onMoveDown={
                index < paragraphs.length - 1
                  ? () => {
                      moveElement(p, 'down');
                      commit();
                    }
                  : undefined
              }
              onRemove={() => {
                removeElement(p);
                commit();
              }}
              removeLabel="Remover parágrafo"
            />
          </Flex>
        ))}
        <AddButton label="Adicionar parágrafo" onClick={addParagraph} />
      </Flex>
    </Box>
  );
};

const KwdGroupBlock: React.FC<{
  lang: string;
  meta: Element;
  kwdGroups: Element[];
  doc: Document;
  commit: () => void;
  onAdd: (lang: string) => void;
}> = ({ lang, kwdGroups, doc, commit, onAdd }) => {
  const group = kwdGroups.find((g) => getLang(g) === lang) ?? null;

  if (!group) {
    return <AddButton label="Adicionar palavras-chave" onClick={() => onAdd(lang)} />;
  }

  const titleEl = directChild(group, 'title');
  const kwds = directChildren(group, 'kwd');
  const text = kwds.map((k) => k.textContent || '').join('; ');

  const setKwds = (value: string) => {
    Array.from(group.querySelectorAll('kwd')).forEach((k) => k.remove());
    value
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((term) => {
        const kwd = doc.createElement('kwd');
        kwd.textContent = term;
        group.appendChild(kwd);
      });
  };

  return (
    <Flex gap={2} alignItems="flex-end">
      <Box width="140px">
        <LabeledInput
          label="Título (ex.: Palavras-chave)"
          value={titleEl?.textContent || ''}
          onChange={(value) => setPlainText(ensureChild(group, 'title'), value)}
          onBlur={commit}
        />
      </Box>
      <Box style={{ flex: 1 }}>
        <LabeledInput
          label="Termos (separados por ;)"
          value={text}
          onChange={setKwds}
          onBlur={commit}
        />
      </Box>
    </Flex>
  );
};

const FundingSection: React.FC<SectionProps & { meta: Element }> = ({ meta, doc, commit }) => {
  const fundingGroup = ensureChild(meta, 'funding-group');
  const statementEl = ensureChild(fundingGroup, 'funding-statement');

  return (
    <FieldGroup title="Financiamento" hint="Declaração de financiamento do artigo (funding-statement).">
      <InlineRichEditor
        key={getElementKey(statementEl)}
        doc={doc}
        initialNodes={statementEl.childNodes}
        onChange={(nodes) => statementEl.replaceChildren(...nodes)}
        onBlur={commit}
      />
    </FieldGroup>
  );
};

const DatesSection: React.FC<SectionProps & { meta: Element }> = ({ meta, doc, commit }) => {
  const history = ensureChild(meta, 'history');
  const receivedDate = ensureDate(history, 'received');
  const acceptedDate = ensureDate(history, 'accepted');
  const authorNotes = ensureChild(meta, 'author-notes');
  const editedByFn = directChildren(authorNotes, 'fn').find((fn) => fn.getAttribute('fn-type') === 'edited-by');

  const addEditedBy = () => {
    const fn = doc.createElement('fn');
    fn.setAttribute('fn-type', 'edited-by');
    fn.appendChild(doc.createElement('label'));
    fn.appendChild(doc.createElement('p'));
    authorNotes.appendChild(fn);
    commit();
  };

  return (
    <FieldGroup title="Datas e editores">
      <Flex gap={4} wrap="wrap">
        <DateFields label="Recebido em" dateEl={receivedDate} commit={commit} />
        <DateFields label="Aprovado em" dateEl={acceptedDate} commit={commit} />
      </Flex>

      <Box>
        <Typography variant="pi" fontWeight="semiBold">
          Editores responsáveis
        </Typography>
        {editedByFn ? (
          <Flex direction="column" alignItems="stretch" gap={2}>
            <LabeledInput
              label="Rótulo"
              value={directChild(editedByFn, 'label')?.textContent || ''}
              onChange={(value) => setPlainText(ensureChild(editedByFn, 'label'), value)}
              onBlur={commit}
            />
            <LabeledInput
              label="Nomes"
              value={directChild(editedByFn, 'p')?.textContent || ''}
              onChange={(value) => setPlainText(ensureChild(editedByFn, 'p'), value)}
              onBlur={commit}
            />
            <ItemToolbar
              onRemove={() => {
                removeElement(editedByFn);
                commit();
              }}
              removeLabel="Remover editores responsáveis"
            />
          </Flex>
        ) : (
          <AddButton label="Adicionar editores responsáveis" onClick={addEditedBy} />
        )}
      </Box>
    </FieldGroup>
  );
};

const ensureDate = (history: Element, dateType: string): Element => {
  const existing = directChildren(history, 'date').find((d) => d.getAttribute('date-type') === dateType);
  if (existing) {
    return existing;
  }
  const dateEl = history.ownerDocument.createElement('date');
  dateEl.setAttribute('date-type', dateType);
  history.appendChild(dateEl);
  return dateEl;
};

const DateFields: React.FC<{ label: string; dateEl: Element; commit: () => void }> = ({
  label,
  dateEl,
  commit,
}) => {
  const dayEl = ensureChild(dateEl, 'day');
  const monthEl = ensureChild(dateEl, 'month');
  const yearEl = ensureChild(dateEl, 'year');

  return (
    <Box>
      <Typography variant="pi" fontWeight="semiBold">
        {label}
      </Typography>
      <Flex gap={2}>
        <Box width="70px">
          <LabeledInput
            label="Dia"
            value={dayEl.textContent || ''}
            onChange={(value) => setPlainText(dayEl, value)}
            onBlur={commit}
          />
        </Box>
        <Box width="70px">
          <LabeledInput
            label="Mês"
            value={monthEl.textContent || ''}
            onChange={(value) => setPlainText(monthEl, value)}
            onBlur={commit}
          />
        </Box>
        <Box width="90px">
          <LabeledInput
            label="Ano"
            value={yearEl.textContent || ''}
            onChange={(value) => setPlainText(yearEl, value)}
            onBlur={commit}
          />
        </Box>
      </Flex>
    </Box>
  );
};
