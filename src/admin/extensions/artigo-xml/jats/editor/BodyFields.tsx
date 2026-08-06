import * as React from 'react';
import { Box, Flex, Typography } from '@strapi/design-system';
import styled from 'styled-components';

import {
  directChild,
  directChildren,
  ensureChild,
  getElementKey,
  moveElement,
  removeElement,
  setPlainText,
  XrefTarget,
} from './domMutations';
import { InlineRichEditor } from './InlineRichEditor';
import { AddButton, FieldGroup, ItemCard, ItemToolbar, LabeledInput, PlainTextField } from './fieldUi';

const XLINK_NS = 'http://www.w3.org/1999/xlink';

const BLOCK_TAGS = ['p', 'sec', 'disp-quote', 'table-wrap', 'fig', 'list', 'boxed-text'];

const BLOCK_LABELS: Record<string, string> = {
  p: 'Parágrafo',
  sec: 'Subseção',
  'disp-quote': 'Citação em bloco',
  'table-wrap': 'Tabela',
  fig: 'Figura',
  list: 'Lista',
  'boxed-text': 'Quadro destacado',
};

const ensureBody = (article: Element): Element => {
  const existing = directChild(article, 'body');
  if (existing) {
    return existing;
  }
  const before = directChild(article, 'back') || null;
  return ensureChild(article, 'body', { before });
};

interface FieldsProps {
  doc: Document;
  commit: () => void;
  xrefTargets: XrefTarget[];
}

/**
 * Editable tree of the article's `<body>`: sections nest recursively, each holding an
 * ordered list of blocks (paragraphs, block quotes, tables, figures, lists, nested
 * sections). Every block can be added, removed and reordered; anything not in
 * `BLOCK_TAGS` (or a block type without a dedicated editor below) is left untouched
 * and shown as read-only, so the raw editor remains the way to change it.
 */
export const BodyFields: React.FC<FieldsProps> = ({ doc, commit, xrefTargets }) => {
  const body = ensureBody(doc.documentElement);

  return (
    <FieldGroup title="Corpo do artigo" hint="Seções e blocos de conteúdo do artigo.">
      <BlockList container={body} doc={doc} commit={commit} depth={2} xrefTargets={xrefTargets} />
    </FieldGroup>
  );
};

const BlockList: React.FC<{
  container: Element;
  doc: Document;
  commit: () => void;
  depth: number;
  xrefTargets: XrefTarget[];
}> = ({ container, doc, commit, depth, xrefTargets }) => {
  const blocks = Array.from(container.children).filter((c) => BLOCK_TAGS.includes(c.tagName.toLowerCase()));

  const addBlock = (tag: string) => {
    const el = doc.createElement(tag);
    if (tag === 'sec') {
      el.appendChild(doc.createElement('title'));
    } else if (tag === 'list') {
      el.setAttribute('list-type', 'bullet');
    } else if (tag === 'table-wrap' || tag === 'fig') {
      el.setAttribute('id', `${tag === 'table-wrap' ? 'tab' : 'fig'}-${getElementKey(el).replace('el-', '')}`);
    }
    container.appendChild(el);
    commit();
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      {blocks.map((block, index) => (
        <BlockItem
          key={getElementKey(block)}
          block={block}
          doc={doc}
          commit={commit}
          depth={depth}
          canMoveUp={index > 0}
          canMoveDown={index < blocks.length - 1}
          xrefTargets={xrefTargets}
        />
      ))}
      <Flex gap={2} wrap="wrap">
        {BLOCK_TAGS.map((tag) => (
          <AddButton key={tag} label={`+ ${BLOCK_LABELS[tag]}`} onClick={() => addBlock(tag)} />
        ))}
      </Flex>
    </Flex>
  );
};

const BlockItem: React.FC<{
  block: Element;
  doc: Document;
  commit: () => void;
  depth: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  xrefTargets: XrefTarget[];
}> = ({ block, doc, commit, depth, canMoveUp, canMoveDown, xrefTargets }) => {
  const tag = block.tagName.toLowerCase();

  return (
    <ItemCard>
      <Flex direction="column" alignItems="stretch" gap={2}>
        <Flex justifyContent="space-between" alignItems="center">
          <Typography variant="pi" fontWeight="bold" textColor="primary600">
            {BLOCK_LABELS[tag] || tag}
          </Typography>
          <ItemToolbar
            onMoveUp={canMoveUp ? () => runAndCommit(commit, () => moveElement(block, 'up')) : undefined}
            onMoveDown={canMoveDown ? () => runAndCommit(commit, () => moveElement(block, 'down')) : undefined}
            onRemove={() => runAndCommit(commit, () => removeElement(block))}
            removeLabel={`Remover ${BLOCK_LABELS[tag] || tag}`}
          />
        </Flex>
        <BlockBody tag={tag} block={block} doc={doc} commit={commit} depth={depth} xrefTargets={xrefTargets} />
      </Flex>
    </ItemCard>
  );
};

const runAndCommit = (commit: () => void, mutate: () => void) => {
  mutate();
  commit();
};

const BlockBody: React.FC<{
  tag: string;
  block: Element;
  doc: Document;
  commit: () => void;
  depth: number;
  xrefTargets: XrefTarget[];
}> = ({ tag, block, doc, commit, depth, xrefTargets }) => {
  switch (tag) {
    case 'p':
      return (
        <InlineRichEditor
          key={getElementKey(block)}
          doc={doc}
          initialNodes={block.childNodes}
          onChange={(nodes) => block.replaceChildren(...nodes)}
          onBlur={commit}
          xrefTargets={xrefTargets}
        />
      );
    case 'sec':
      return (
        <SectionBody sec={block} doc={doc} commit={commit} depth={depth + 1} xrefTargets={xrefTargets} />
      );
    case 'disp-quote':
      return <QuoteBody el={block} doc={doc} commit={commit} xrefTargets={xrefTargets} />;
    case 'table-wrap':
      return <TableBody el={block} doc={doc} commit={commit} />;
    case 'fig':
      return <FigureBody el={block} doc={doc} commit={commit} />;
    case 'list':
      return <ListBody el={block} doc={doc} commit={commit} depth={depth} xrefTargets={xrefTargets} />;
    case 'boxed-text':
      return <BlockList container={block} doc={doc} commit={commit} depth={depth} xrefTargets={xrefTargets} />;
    default:
      return (
        <Typography variant="pi" textColor="neutral600">
          Este bloco não é editável por aqui; use a aba de XML bruto para alterá-lo.
        </Typography>
      );
  }
};

const SectionBody: React.FC<{
  sec: Element;
  doc: Document;
  commit: () => void;
  depth: number;
  xrefTargets: XrefTarget[];
}> = ({ sec, doc, commit, depth, xrefTargets }) => {
  const titleEl = ensureChild(sec, 'title');

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      <InlineRichEditor
        key={getElementKey(titleEl)}
        doc={doc}
        initialNodes={titleEl.childNodes}
        placeholder="Título da seção"
        onChange={(nodes) => titleEl.replaceChildren(...nodes)}
        onBlur={commit}
        xrefTargets={xrefTargets}
      />
      <Indent>
        <BlockList container={sec} doc={doc} commit={commit} depth={depth} xrefTargets={xrefTargets} />
      </Indent>
    </Flex>
  );
};

const QuoteBody: React.FC<{ el: Element; doc: Document; commit: () => void; xrefTargets: XrefTarget[] }> = ({
  el,
  doc,
  commit,
  xrefTargets,
}) => {
  const attrib = directChild(el, 'attrib');
  const paragraphs = directChildren(el, 'p');

  const addParagraph = () => {
    el.insertBefore(doc.createElement('p'), attrib);
    commit();
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      {paragraphs.map((p, index) => (
        <Flex key={getElementKey(p)} gap={2} alignItems="flex-start">
          <Box style={{ flex: 1 }}>
            <InlineRichEditor
              key={getElementKey(p)}
              doc={doc}
              initialNodes={p.childNodes}
              onChange={(nodes) => p.replaceChildren(...nodes)}
              onBlur={commit}
              xrefTargets={xrefTargets}
            />
          </Box>
          <ItemToolbar
            onMoveUp={index > 0 ? () => runAndCommit(commit, () => moveElement(p, 'up')) : undefined}
            onMoveDown={
              index < paragraphs.length - 1 ? () => runAndCommit(commit, () => moveElement(p, 'down')) : undefined
            }
            onRemove={() => runAndCommit(commit, () => removeElement(p))}
            removeLabel="Remover parágrafo"
          />
        </Flex>
      ))}
      <AddButton label="Adicionar parágrafo" onClick={addParagraph} />
      <LabeledInput
        label="Atribuição (fonte da citação)"
        value={attrib?.textContent || ''}
        onChange={(value) => setPlainText(ensureChild(el, 'attrib'), value)}
        onBlur={commit}
      />
    </Flex>
  );
};

const TableBody: React.FC<{ el: Element; doc: Document; commit: () => void }> = ({ el, doc, commit }) => {
  const table = ensureChild(el, 'table');
  const caption = directChild(el, 'caption');
  const labelEl = directChild(el, 'label');
  const captionTitleEl = caption ? directChild(caption, 'title') : null;
  const foot = directChild(el, 'table-wrap-foot');
  const attrib = foot ? directChild(foot, 'attrib') : null;
  const rows = Array.from(table.querySelectorAll('tr'));

  const setLabel = (value: string) => {
    setPlainText(ensureChild(el, 'label', { before: caption ?? table }), value);
  };

  const setCaptionTitle = (value: string) => {
    const captionEl = ensureChild(el, 'caption', { before: table });
    setPlainText(ensureChild(captionEl, 'title'), value);
  };

  const setAttrib = (value: string) => {
    const footEl = ensureChild(el, 'table-wrap-foot');
    setPlainText(ensureChild(footEl, 'attrib'), value);
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      <Flex gap={2}>
        <Box width="100px">
          <LabeledInput label="Rótulo" value={labelEl?.textContent || ''} onChange={setLabel} onBlur={commit} />
        </Box>
        <Box style={{ flex: 1 }}>
          <LabeledInput
            label="Legenda"
            value={captionTitleEl?.textContent || ''}
            onChange={setCaptionTitle}
            onBlur={commit}
          />
        </Box>
      </Flex>

      <Typography variant="pi" textColor="neutral600">
        Células da tabela (edição célula a célula; estrutura de linhas/colunas segue a do XML original)
      </Typography>
      <Box overflow="auto">
        <PlainHtmlTable>
          <tbody>
            {rows.map((row) => (
              <tr key={getElementKey(row)}>
                {Array.from(row.children).map((cell) => (
                  <td key={getElementKey(cell)}>
                    <PlainTextField
                      ariaLabel="Célula da tabela"
                      value={cell.textContent || ''}
                      onChange={(value) => setPlainText(cell, value)}
                      onBlur={commit}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </PlainHtmlTable>
      </Box>

      <LabeledInput label="Nota da tabela" value={attrib?.textContent || ''} onChange={setAttrib} onBlur={commit} />
    </Flex>
  );
};

const FigureBody: React.FC<{ el: Element; doc: Document; commit: () => void }> = ({ el, commit }) => {
  const caption = directChild(el, 'caption');
  const graphic = ensureChild(el, 'graphic');
  const labelEl = directChild(el, 'label');
  const captionTitleEl = caption ? directChild(caption, 'title') : null;
  const attrib = directChild(el, 'attrib');
  const href = graphic.getAttributeNS(XLINK_NS, 'href') || graphic.getAttribute('xlink:href') || '';

  const setLabel = (value: string) => {
    setPlainText(ensureChild(el, 'label', { before: caption ?? graphic }), value);
  };

  const setCaptionTitle = (value: string) => {
    const captionEl = ensureChild(el, 'caption', { before: graphic });
    setPlainText(ensureChild(captionEl, 'title'), value);
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      <Flex gap={2}>
        <Box width="100px">
          <LabeledInput label="Rótulo" value={labelEl?.textContent || ''} onChange={setLabel} onBlur={commit} />
        </Box>
        <Box style={{ flex: 1 }}>
          <LabeledInput
            label="Legenda"
            value={captionTitleEl?.textContent || ''}
            onChange={setCaptionTitle}
            onBlur={commit}
          />
        </Box>
      </Flex>
      <LabeledInput
        label="Arquivo de imagem (nome/URL)"
        value={href}
        onChange={(value) => graphic.setAttributeNS(XLINK_NS, 'xlink:href', value)}
        onBlur={commit}
      />
      <LabeledInput
        label="Nota da figura"
        value={attrib?.textContent || ''}
        onChange={(value) => setPlainText(ensureChild(el, 'attrib'), value)}
        onBlur={commit}
      />
    </Flex>
  );
};

const ListBody: React.FC<{
  el: Element;
  doc: Document;
  commit: () => void;
  depth: number;
  xrefTargets: XrefTarget[];
}> = ({ el, doc, commit, depth, xrefTargets }) => {
  const ordered = (el.getAttribute('list-type') || '').toLowerCase() === 'order';
  const items = directChildren(el, 'list-item');

  const addItem = () => {
    const item = doc.createElement('list-item');
    item.appendChild(doc.createElement('p'));
    el.appendChild(item);
    commit();
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      <Flex gap={2} alignItems="center">
        <Typography variant="pi">Tipo de lista:</Typography>
        <select
          value={ordered ? 'order' : 'bullet'}
          onChange={(event) => {
            el.setAttribute('list-type', event.target.value);
            commit();
          }}
        >
          <option value="bullet">Marcadores</option>
          <option value="order">Numerada</option>
        </select>
      </Flex>

      {items.map((item, index) => (
        <Flex key={getElementKey(item)} gap={2} alignItems="flex-start">
          <Box style={{ flex: 1 }}>
            <BlockList container={item} doc={doc} commit={commit} depth={depth} xrefTargets={xrefTargets} />
          </Box>
          <ItemToolbar
            onMoveUp={index > 0 ? () => runAndCommit(commit, () => moveElement(item, 'up')) : undefined}
            onMoveDown={
              index < items.length - 1 ? () => runAndCommit(commit, () => moveElement(item, 'down')) : undefined
            }
            onRemove={() => runAndCommit(commit, () => removeElement(item))}
            removeLabel="Remover item da lista"
          />
        </Flex>
      ))}
      <AddButton label="Adicionar item" onClick={addItem} />
    </Flex>
  );
};

const Indent = styled.div`
  padding-left: 16px;
  border-left: 2px solid #eaeaef;
`;

const PlainHtmlTable = styled.table`
  border-collapse: collapse;

  td {
    border: 1px solid #dcdce4;
    padding: 4px;
    min-width: 120px;
  }
`;
