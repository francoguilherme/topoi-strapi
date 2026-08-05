# Renderizador de artigos JATS

Este módulo transforma o XML de um artigo (padrão **JATS / SciELO Publishing Schema**)
em uma visualização legível, tipo "paper", dentro da tela **Gerenciar XML** do admin.

- `inline.tsx` — renderiza conteúdo inline (texto + `<italic>`, `<bold>`, `<xref>`, `<ext-link>`, etc.)
- `blocks.tsx` — renderiza blocos (`<p>`, `<sec>`, `<table-wrap>`, `<fig>`, `<disp-quote>`, `<list>`, `<boxed-text>`)
- `ArticleRenderer.tsx` — parseia o XML e monta o artigo completo (front matter, corpo, back matter)
- `styles.ts` — estilos (`styled-components`) só para o container do artigo renderizado

Não há dependência de parsing externa: o parsing usa o `DOMParser` nativo do navegador.

## O que faz o XML ser considerado "válido"

A validação em `parseJatsXml` é intencionalmente mínima. Só existem **dois** critérios
que fazem o renderizador desistir e a página cair para a visualização de XML bruto
(com um aviso ao usuário):

1. **O XML precisa ser bem formado.** Se o `DOMParser` encontrar um erro de sintaxe
   (`<parsererror>` no documento resultante), falha.
2. **O elemento raiz precisa se chamar `<article>`** (case-insensitive). Isso é só
   para garantir que não estamos tentando renderizar algo que claramente não é um
   artigo JATS (ex.: um XML de outro formato enviado por engano).

Não há verificação de schema/DTD nem de campos obrigatórios. **Nenhum elemento ou
atributo específico do conteúdo é exigido** — tudo abaixo do elemento raiz é tratado
como opcional.

## Tudo mais é opcional e degrada graciosamente

Cada pedaço do artigo é lido de forma defensiva (retorna `null`/`[]` se não existir)
e só é renderizado condicionalmente. Faltar qualquer um dos itens abaixo **não**
quebra a renderização — a seção correspondente simplesmente não aparece:

| Elemento JATS | Efeito se ausente |
| --- | --- |
| `article-categories > subj-group > subject` (eyebrow/dossiê) | Linha do dossiê não aparece |
| `title-group > article-title` | Título (`<h1>`) não aparece |
| `title-group > trans-title-group` | Títulos traduzidos não aparecem |
| `contrib-group > contrib` (autores) | Linha de autores não aparece |
| `aff` (afiliações) | Bloco de afiliações não aparece |
| `institution` dentro de `<aff>` | A linha da afiliação aparece só com label/e-mail/país disponíveis |
| `abstract` / `trans-abstract` | Bloco(s) de resumo não aparecem |
| `kwd-group` | Linha de palavras-chave não aparece (mesmo se o resumo existir) |
| `funding-group > funding-statement` / `back > ack` | Seção "Financiamento" não aparece |
| `back > fn-group > fn` (notas de rodapé) | Seção "Notas" não aparece |
| `back > ref-list > ref` (referências) | Seção "Referências" não aparece |
| `ref > mixed-citation` | Cai para uma montagem simplificada a partir de `element-citation` (autores, título, fonte, ano) |
| `history > date[date-type="received"|"accepted"]` | Datas de recebimento/aprovação somem do rodapé |
| `author-notes > fn[fn-type="edited-by"]` (editores responsáveis) | Linha de editores some do rodapé |
| `fig` sem `graphic` / `xlink:href` | Legenda ainda aparece, sem a tag `<img>` |
| `table-wrap` sem `label`/`caption` | Tabela aparece sem título acima |

O `<body>` em si é opcional (`{body && renderBlockNodes(...)}`) — um artigo sem
`<body>` ainda renderiza o cabeçalho (título/autores/resumo) normalmente.

## Tags desconhecidas ou inesperadas

Tanto o renderizador de blocos quanto o de conteúdo inline têm um fallback de
"desembrulhar" (`unwrap`): ao encontrar uma tag que não reconhecem, eles não a
descartam — eles renderizam os filhos dela recursivamente. Isso significa que
variações razoáveis de XML JATS (outras revistas, outras tags de formatação)
tendem a continuar exibindo o conteúdo, só sem a formatação/semântica específica
daquela tag.

## Limitações conhecidas

- **Imagens**: `<graphic xlink:href="...">` é renderizado como um `<img src="...">"`
  apontando para o nome do arquivo original. Como nenhuma imagem é hospedada, isso
  **sempre aparece quebrado** — comportamento esperado por enquanto.
- **Tabelas**: a conversão de `<table>` é 1:1 para HTML (`thead`/`tbody`/`tr`/`th`/`td`,
  `align`/`valign`/`rowspan`/`colspan`), mas não cobre recursos avançados de tabela
  JATS (ex.: `<colgroup>` com larguras específicas). Isso é só decorativo; não afeta
  a validade do XML.
- **Referências sem `mixed-citation`**: a montagem a partir de `element-citation`
  é simplificada (autores + título + fonte + ano concatenados), sem replicar o
  formato exato de uma citação ABNT/APA/etc.
