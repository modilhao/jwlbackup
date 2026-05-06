# Especificação Técnica — Exportador JW Library → Obsidian

> Documento para reimplementação no app **[jwlbackup](https://github.com/modilhao/jwlbackup)** (Svelte + Vite + TypeScript, browser-based, client-side).
>
> Baseado no pipeline executado em 30/04 e 01/05 de 2026 sobre o backup pessoal de Marcel Souza, gerando vault Obsidian com 8.913 notas estruturadas a partir de 3.223 notas pessoais + 44.480 destaques.

---

## 0. Contexto e propósito

Usuários de JW Library acumulam ao longo dos anos um corpus pessoal valioso: anotações em versículos bíblicos, destaques em publicações, tags temáticas, marcadores. Esse corpus está preso dentro do app oficial, em formato proprietário, sem possibilidade nativa de exportação estruturada para outros sistemas de gestão de conhecimento.

Obsidian é a ferramenta-padrão para "segundo cérebro" baseado em markdown plain-text. Conectar JW Library → Obsidian permite ao usuário transformar uma coleção cronológica de notas em uma rede temática navegável, com links cruzados, MOCs (Maps of Content), tags hierárquicas e dashboards.

Esta especificação documenta o pipeline completo executado e propõe uma feature de exportação para o `jwlbackup`, que já tem a infraestrutura de leitura de `.jwlibrary` no browser.

---

## 1. Pipeline geral

```
.jwlibrary (zip)
    │
    ├─► userData.db (SQLite)
    │       │
    │       ├─► Tabelas: Note, Location, Tag, TagMap, UserMark, BlockRange, Bookmark
    │       │
    │       └─► Mapeamentos: BookNumber → livro, KeySymbol → publicação, Tag → slug
    │
    ├─► Imagens (.jpg, .png) — não exportadas nesta versão
    │
    └─► manifest.json — metadados do backup
            │
            ▼
    ┌────────────────────────────────────────────────┐
    │  Geração de arquivos markdown estruturados     │
    │                                                  │
    │  1. Notas pessoais (uma .md por Note)           │
    │  2. Versículos atômicos (uma .md por verso ref.)│
    │  3. MOCs (um .md por tag pessoal)               │
    │  4. Templates (4 arquivos)                       │
    │  5. Home page (Espiritual.md)                   │
    └────────────────────────────────────────────────┘
            │
            ▼
    Obsidian Vault (folder hierárquico, frontmatter YAML, wikilinks)
```

**Pré-condições:**
- O usuário tem um vault Obsidian (existente ou novo)
- Stack do app: o app já lê `.jwlibrary` no browser (já implementado em jwlbackup)

**Pós-condições:**
- Folder com 3.000-10.000 arquivos `.md` prontos para o Obsidian abrir
- Frontmatter YAML em cada nota permite consultas via Dataview
- Estrutura é não-destrutiva (não modifica nada que o usuário já tinha no vault)

---

## 2. Schema do `.jwlibrary`

### 2.1 Estrutura do zip

```
backup.jwlibrary  (zip, sem extensão .zip oficial)
├── userData.db          ← SQLite com toda a biblioteca pessoal
├── manifest.json        ← metadados do backup
├── default_thumbnail.png
└── *.jpg / *.png        ← imagens incorporadas em playlists/notas
```

Exemplo de `manifest.json`:

```json
{
  "name": "UserdataBackup_2026-04-30_iPad.jwlibrary",
  "creationDate": "2026-04-30T19:35:56-0300",
  "version": 1,
  "userDataBackup": {
    "databaseName": "userData.db",
    "lastModifiedDate": "2026-04-29T20:48:31-0300",
    "hash": "ef1d7ccc4f145a7d291c236ab32e80115c0427aa0a396bcc34aaa0904e6f70",
    "deviceName": "iPad",
    "schemaVersion": 14
  },
  "type": 0
}
```

`schemaVersion: 14` é o esquema atual em 2026. Versões anteriores podem ter colunas a menos.

### 2.2 Schema SQLite (tabelas relevantes)

#### Tabela `Note` — anotações pessoais do usuário

```sql
CREATE TABLE Note (
  NoteId           INTEGER PRIMARY KEY,
  Guid             TEXT,
  UserMarkId       INTEGER,        -- liga a um destaque, opcional
  LocationId       INTEGER,        -- liga à publicação/versículo
  Title            TEXT,           -- geralmente o trecho bíblico/destacado
  Content          TEXT,           -- a reflexão pessoal escrita pelo usuário
  LastModified     TEXT,           -- ISO 8601 com timezone
  Created          TEXT,           -- ISO 8601 UTC
  BlockType        INTEGER,        -- 0=publicação, 1=parágrafo, 2=versículo
  BlockIdentifier  INTEGER         -- número do parágrafo ou versículo
);
```

**Insights críticos:**
- Quando `BlockType = 2`, `BlockIdentifier` É O NÚMERO DO VERSÍCULO. Use para construir referências bíblicas atômicas.
- `Title` costuma conter o **texto literal do versículo da TNM** (Tradução do Novo Mundo). Reaproveite como conteúdo.
- `Content` é a reflexão pessoal (o ouro real do usuário).
- Datas em formatos diferentes: `Created` em UTC (`Z`), `LastModified` com offset local (`-0300`). Normalizar.

#### Tabela `Location` — referência (publicação/livro/capítulo)

```sql
CREATE TABLE Location (
  LocationId       INTEGER PRIMARY KEY,
  BookNumber       INTEGER,    -- 1..66 quando é versículo bíblico
  ChapterNumber    INTEGER,
  DocumentId       INTEGER,    -- id do documento dentro da publicação
  Track            INTEGER,
  IssueTagNumber   INTEGER,    -- ex: 20240115 para revistas
  KeySymbol        TEXT,       -- 'nwtsty', 'w', 'mwb', 'jy', etc.
  MepsLanguage     INTEGER,
  Type             INTEGER,    -- 0=publicação/Bíblia, 1=mídia, 3=outro
  Title            TEXT
);
```

#### Tabela `Tag` — tags pessoais do usuário

```sql
CREATE TABLE Tag (
  TagId   INTEGER PRIMARY KEY,
  Type    INTEGER,    -- 0=Favorite, 1=tag normal, 2=playlist
  Name    TEXT
);
```

#### Tabela `TagMap` — relação N:N entre tags e itens

```sql
CREATE TABLE TagMap (
  TagMapId          INTEGER PRIMARY KEY,
  PlaylistItemId    INTEGER,
  LocationId        INTEGER,
  NoteId            INTEGER,    -- preencha apenas um destes 3
  TagId             INTEGER,
  Position          INTEGER
);
```

Para tags em notas, filtrar por `NoteId IS NOT NULL`.

#### Tabela `UserMark` — destaques (highlights)

```sql
CREATE TABLE UserMark (
  UserMarkId       INTEGER PRIMARY KEY,
  ColorIndex       INTEGER,    -- 0..6 (cores do JW Library)
  LocationId       INTEGER,
  StyleIndex       INTEGER,    -- 0=highlight, outros estilos
  UserMarkGuid     TEXT,
  Version          INTEGER
);
```

#### Tabela `BlockRange` — intervalos de texto destacados

```sql
CREATE TABLE BlockRange (
  BlockRangeId  INTEGER PRIMARY KEY,
  BlockType     INTEGER,    -- 1=parágrafo, 2=versículo
  Identifier    INTEGER,
  StartToken    INTEGER,
  EndToken      INTEGER,
  UserMarkId    INTEGER
);
```

Cada UserMark pode ter múltiplos BlockRange (destaque que cobre vários parágrafos).

#### Tabela `Bookmark` — marcadores rápidos

```sql
CREATE TABLE Bookmark (
  BookmarkId             INTEGER PRIMARY KEY,
  LocationId             INTEGER,
  PublicationLocationId  INTEGER,
  Slot                   INTEGER,    -- 0..9 (10 slots por publicação)
  Title                  TEXT,
  Snippet                TEXT,
  BlockType              INTEGER,
  BlockIdentifier        INTEGER
);
```

### 2.3 Volume típico de um usuário ativo

Caso de Marcel (5+ anos de uso ativo):

| Tabela | Linhas |
|---|---|
| Note | 3.223 |
| UserMark | 44.480 |
| BlockRange | 47.135 |
| Location | 2.183 |
| TagMap | 3.138 |
| Tag | 35 |
| Bookmark | 40 |

**Implicação:** o app deve ser performático com queries em tabelas de 50k+ linhas. SQLite no browser via `sql.js` é viável.

---

## 3. Mapeamentos

### 3.1 BookNumber → nome do livro bíblico

Numeração canônica das Testemunhas de Jeová (e da maioria das tradições cristãs):

```typescript
const BOOKS: Record<number, string> = {
  1: 'Gênesis', 2: 'Êxodo', 3: 'Levítico', 4: 'Números', 5: 'Deuteronômio',
  6: 'Josué', 7: 'Juízes', 8: 'Rute', 9: '1 Samuel', 10: '2 Samuel',
  11: '1 Reis', 12: '2 Reis', 13: '1 Crônicas', 14: '2 Crônicas', 15: 'Esdras',
  16: 'Neemias', 17: 'Ester', 18: 'Jó', 19: 'Salmos', 20: 'Provérbios',
  21: 'Eclesiastes', 22: 'Cântico de Salomão', 23: 'Isaías', 24: 'Jeremias',
  25: 'Lamentações', 26: 'Ezequiel', 27: 'Daniel', 28: 'Oseias', 29: 'Joel',
  30: 'Amós', 31: 'Obadias', 32: 'Jonas', 33: 'Miqueias', 34: 'Naum',
  35: 'Habacuque', 36: 'Sofonias', 37: 'Ageu', 38: 'Zacarias', 39: 'Malaquias',
  40: 'Mateus', 41: 'Marcos', 42: 'Lucas', 43: 'João', 44: 'Atos',
  45: 'Romanos', 46: '1 Coríntios', 47: '2 Coríntios', 48: 'Gálatas', 49: 'Efésios',
  50: 'Filipenses', 51: 'Colossenses', 52: '1 Tessalonicenses', 53: '2 Tessalonicenses',
  54: '1 Timóteo', 55: '2 Timóteo', 56: 'Tito', 57: 'Filêmon', 58: 'Hebreus',
  59: 'Tiago', 60: '1 Pedro', 61: '2 Pedro', 62: '1 João', 63: '2 João',
  64: '3 João', 65: 'Judas', 66: 'Apocalipse'
};

const testamento = (n: number): 'AT' | 'NT' => n <= 39 ? 'AT' : 'NT';
```

### 3.2 KeySymbol → publicação JW (PT)

Os mais comuns que aparecem em backups brasileiros:

```typescript
const KEY_SYMBOLS: Record<string, { name: string; slug: string; short: string }> = {
  // Bíblia
  nwtsty: { name: 'Bíblia (TNM Estudo)', slug: 'biblia-tnm', short: 'Bíblia' },
  nwt:    { name: 'Bíblia (TNM)', slug: 'biblia-tnm', short: 'Bíblia' },

  // Revistas
  w:      { name: 'A Sentinela', slug: 'sentinela', short: 'Sentinela' },
  g:      { name: 'Despertai!', slug: 'despertai', short: 'Despertai' },

  // Apostilas semanais
  mwb:    { name: 'Vida e Ministério', slug: 'vida-ministerio', short: 'Vida e Ministério' },

  // Livros
  jy:     { name: 'Jesus — O Caminho', slug: 'livro-jy', short: 'Jesus o Caminho' },
  lfb:    { name: 'Aprenda do Grande Mestre', slug: 'livro-lfb', short: 'Grande Mestre' },
  lff:    { name: 'Ame as Pessoas — Vida de Jesus', slug: 'livro-lff', short: 'Vida de Jesus' },
  rr:     { name: 'Pura Adoração de Jeová', slug: 'livro-rr', short: 'Pura Adoração' },
  kr:     { name: 'O Reino de Deus já governa!', slug: 'livro-kr', short: 'Reino governa' },
  bt:     { name: 'Dêem Testemunho Cabal', slug: 'livro-bt', short: 'Testemunho Cabal' },
  it:     { name: 'Estudo Perspicaz', slug: 'livro-it', short: 'Estudo Perspicaz' },
  bhs:    { name: 'O que a Bíblia Realmente Ensina', slug: 'livro-bhs', short: 'Bíblia Ensina' },
  lmd:    { name: 'Ame a Jeová', slug: 'livro-lmd', short: 'Ame a Jeová' },
  sfl:    { name: 'Saiba Viver Feliz Para Sempre', slug: 'livro-sfl', short: 'Viver Feliz' },
  od:     { name: 'Organizados para a Vontade de Jeová', slug: 'livro-od', short: 'Organizados' },
  be:     { name: 'Beneficie-se da Escola do Ministério', slug: 'livro-be', short: 'Escola do Ministério' },
  fg:     { name: 'Boas Notícias da Parte de Deus', slug: 'livro-fg', short: 'Boas Notícias' },
  cl:     { name: 'Aproxime-se de Jeová', slug: 'livro-cl', short: 'Aproxime-se' },
  scl:    { name: 'Tornem-se Amigos de Jeová', slug: 'livro-scl', short: 'Amigos de Jeová' },

  // Anuários
  es25:   { name: 'Anuário 2025', slug: 'anuario-25', short: 'Anuário 2025' },
  es24:   { name: 'Anuário 2024', slug: 'anuario-24', short: 'Anuário 2024' },
  es23:   { name: 'Anuário 2023', slug: 'anuario-23', short: 'Anuário 2023' },
  es26:   { name: 'Anuário 2026', slug: 'anuario-26', short: 'Anuário 2026' },

  // Programas
  'S-34': { name: 'Programa S-34', slug: 'programa-s34', short: 'S-34' },
  'S-31': { name: 'Programa S-31', slug: 'programa-s31', short: 'S-31' },
};

function pubInfo(key: string | null) {
  if (!key) return { name: 'Outras', slug: 'outras', short: 'Outras' };
  return KEY_SYMBOLS[key] ?? {
    name: `Publicação (${key})`,
    slug: `pub-${key.toLowerCase()}`,
    short: key
  };
}
```

**Importante:** novos KeySymbols aparecem todo ano (ex: `es27`, `mwb27.X`). O app deve ter um fallback genérico que não quebra com KeySymbols desconhecidos.

### 3.3 Tag JW → slug hierárquico

Tags do JW Library são strings livres. Para Obsidian, é melhor convertê-las em **tags hierárquicas** prefixadas por categoria (`tema/`, `pessoa/`, `colecao/`, etc.).

Estratégia: o usuário define o prefixo de cada tag. O app sugere defaults inteligentes baseados em heurística:

```typescript
type TagCategory = 'tipo' | 'tema' | 'pessoa' | 'colecao' | 'discurso' | 'outros';

interface TagMapping {
  original: string;        // ex: "Jeová Deus"
  slug: string;            // ex: "jeova"
  category: TagCategory;   // ex: "pessoa"
  fullSlug: string;        // ex: "pessoa/jeova"
}

function suggestCategory(tagName: string): TagCategory {
  const lower = tagName.toLowerCase();
  // Heurística: nomes próprios → pessoa
  if (/jeová|jesus|cristo|paulo|davi|abraão|moisés/i.test(tagName)) return 'pessoa';
  // Tipos → tipo
  if (/discurso|reflexão|pregação|favorito/i.test(tagName)) return 'tipo';
  // Coletâneas (nome de pessoa próximo do usuário)
  if (/tesouros da/i.test(tagName)) return 'colecao';
  // Discursos numerados
  if (/^discurso \d+/i.test(tagName)) return 'discurso';
  // Default: tema
  return 'tema';
}

function nameToSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // remove diacríticos
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}
```

**UX recomendada:** apresentar uma tela onde cada tag aparece com a categoria sugerida e um dropdown para o usuário ajustar antes de exportar.

---

## 4. Geração das notas Obsidian

### 4.1 Estrutura de pastas

```
<vault>/
├── Espiritual.md                    ← Home page
├── Templates/
│   ├── T-NotaJW.md
│   ├── T-Versiculo.md
│   ├── T-MOC.md
│   └── T-Pessoa.md
├── _MOCs/                           ← Maps of Content (1 por tag pessoal)
│   ├── MOC - Entendimentos.md
│   ├── MOC - Ser cristão.md
│   └── ... (N MOCs)
├── Bíblia/                          ← Versículos atômicos
│   ├── Apocalipse/
│   │   ├── Apocalipse 1.6.md
│   │   ├── Apocalipse 21.3.md
│   │   └── ... (1 por verso referenciado)
│   ├── Salmos/                      ← Subpastas em folders >300 arquivos
│   │   ├── 001-050/
│   │   ├── 051-100/
│   │   └── 101-150/
│   └── Mapa de Apocalipse.md        ← MOC do livro bíblico
└── JW Library/
    └── Notas/
        ├── Bíblia/<Livro>/          ← notas pessoais por livro
        │   ├── Apocalipse/
        │   ├── Salmos/
        │   └── ...
        └── Publicações/<Pub>/        ← notas de publicações
            ├── Sentinela/
            ├── Vida e Ministério/
            └── ...
```

### 4.2 Naming convention

| Tipo | Padrão | Exemplo |
|---|---|---|
| Versículo atômico | `<Livro> <Cap>.<Vers>.md` | `Apocalipse 21.3.md` |
| Nota JW (versículo) | `<Livro> <Cap>.<Vers> — <snippet>.md` | `Isaías 56.4 — diz Jeová aos eunucos.md` |
| Nota JW (cap. todo) | `<Livro> <Cap> — <snippet>.md` | `Apocalipse 21 — promessa.md` |
| Nota de publicação | `<PubShort> — <snippet>.md` | `Sentinela — espera ansiosa.md` |
| MOC | `MOC - <Tema>.md` | `MOC - Entendimentos.md` |
| Mapa de livro | `Mapa de <Livro>.md` | `Mapa de Apocalipse.md` |

**Regras de sanitização:**
- Trocar `:` por `.` (proíbido em filenames de filesystems)
- Remover `/`, `\`, `*`, `?`, `"`, `<`, `>`, `|`
- Substituir NBSP (` `) e NNBSP (` `) por espaço normal
- Limitar a 80 chars (cortar em palavra completa, adicionar `…`)
- Em caso de conflito de nome, sufixar com `(NoteId)`

**Crítico para wikilinks:** Obsidian resolve `[[Apocalipse 21.3]]` por nome de arquivo, **não por path**. Isso significa que mover um arquivo de `Bíblia/Apocalipse/` para `Bíblia/Apocalipse/cap-21/` não quebra wikilinks existentes. Use isso a favor.

### 4.3 Frontmatter YAML

#### Para nota de versículo bíblico (BlockType=2)

```yaml
---
tipo: nota-jw
fonte: jw-library
livro: "Isaías"
capitulo: 56
versiculo: 4
testamento: AT
publicacao: "Bíblia (TNM Estudo)"
key-symbol: "nwtsty"
created: "2026-04-29T15:53:38Z"
modified: "2026-04-29T12:54:53-0300"
note-id: 3319
tags-jw: ["Entendimentos"]
tags: [tipo/nota-jw, tema/entendimento, livro/at/isaias]
---
```

#### Para nota de publicação não-bíblica

```yaml
---
tipo: nota-jw
fonte: jw-library
publicacao: "A Sentinela"
key-symbol: "w"
document-id: 2024123
issue-tag: 20240115
created: "2024-02-10T..."
modified: "..."
note-id: 1234
tags-jw: ["Princípios"]
tags: [tipo/nota-jw, tema/principios, fonte/pub/sentinela]
---
```

### 4.4 Conteúdo (template)

```markdown
# {Livro} {Cap}:{Vers}     ← ou nome da publicação

## Trecho destacado

> {Title da nota — o texto bíblico ou da publicação}

## Reflexão pessoal

{Content da nota — escrito pelo usuário, preservar formatação}

## Versículo atômico

- [[{Livro} {Cap}.{Vers}]]    ← link para a nota atômica do verso
```

---

## 5. Camadas adicionais

### 5.1 Versículos atômicos

**Conceito:** cada versículo bíblico referenciado vira um arquivo `.md` independente. Esse arquivo se torna um hub que recebe backlinks de todas as notas, discursos, reflexões que mencionam aquele versículo.

**Conteúdo do arquivo:**

```markdown
---
tipo: versiculo
livro: Apocalipse
capitulo: 21
versiculos: "3"
testamento: NT
secao: profecia    ← opcional, deduzir do livro
temas: []          ← preenchido pelo usuário
pessoas: []
paralelos: []
status: faltante-tnm | embriao | desenvolver | maduro
---

# {Livro} {Cap}:{Vers}

## Texto (TNM)

> {se vier do JW Library, usar o Title da Note correspondente}
> {senão, deixar placeholder}

## Contexto

*(contexto histórico e literário)*

## Pontos-chave
-

## Aplicação pessoal
-

## Cruzamentos
- [[Mapa de {Livro}]]

## Notas pessoais que citam este versículo

```dataview
TABLE without id file.link as "Nota", file.mtime as "Modificada"
FROM #livro/{at|nt}/{slug}
WHERE livro = "{Livro}" AND capitulo = {Cap} AND versiculo = {Vers}
SORT file.mtime DESC
```
```

**Quando criar:** apenas para versículos efetivamente referenciados (não criar versículos atômicos de toda a Bíblia, geraria 31.000 arquivos vazios).

### 5.2 MOCs (Maps of Content)

**Conceito:** uma nota cuja única função é ser um hub temático. Lista (com contexto) outras notas relacionadas a um tema. Inspirado no framework LYT (Linking Your Thinking) de Nick Milo.

**Geração automática:** um MOC por tag pessoal do JW Library.

```markdown
---
tipo: moc
tema: "Entendimentos"
tag-slug: tema/entendimento
quantidade-itens: 2041
status: maduro
---

# MOC — {Tema}

> Hub temático construído a partir da tag JW Library "**{Tema}**" ({N} notas).

## Por que esse tema importa

*(escrever sua perspectiva pessoal sobre por que esse tema é central)*

## Versículos centrais
-

## Notas relacionadas (auto)

```dataview
TABLE without id file.link as "Nota", livro as "Livro", capitulo as "Cap.", file.mtime as "Modificada"
FROM #{slug-da-tag}
SORT file.mtime DESC
LIMIT 100
```

## Conexões com outros temas
-

## Perguntas em aberto
-
```

### 5.3 Templates

Quatro templates pré-instalados em `Templates/`:

- `T-NotaJW.md` — para criar nova nota manualmente seguindo o padrão
- `T-Versiculo.md` — para criar versículo atômico novo
- `T-MOC.md` — para criar novo MOC
- `T-Pessoa.md` — para criar página de pessoa bíblica

### 5.4 Home page (`Espiritual.md`)

Hub central do projeto. Inclui:

- Lista dos MOCs (Dataview LIST)
- Distribuição por livro bíblico (Dataview TABLE GROUP BY)
- Distribuição por publicação (Dataview TABLE GROUP BY)
- Notas mais recentes (Dataview TABLE SORT modified DESC LIMIT 20)
- Estatísticas (frontmatter da home + manual)
- Seção de "Como usar" com convenções

**Para mobile:** criar também uma `Espiritual Mobile.md` com queries reduzidas (sem GROUP BY, com LIMIT pequeno, ou apenas links estáticos).

---

## 6. Reconciliação com vault existente

Esta é a parte mais inovadora e a que dá maior retorno ao usuário. Após importar as notas do JW Library, o usuário ainda tem suas notas legadas (Texto Diário, Discursos, Reflexões, etc.) sem conexão à camada nova de versículos atômicos.

### 6.1 Detecção de referências bíblicas (regex)

Construir um regex robusto a partir do mapeamento de variantes de nome:

```typescript
const BOOK_VARIANTS: Record<string, number> = {};
function addVariants(num: number, ...names: string[]) {
  for (const n of names) BOOK_VARIANTS[n.toLowerCase()] = num;
}

// Cobertura mínima recomendada (PT-BR)
addVariants(1, "Gênesis", "Genesis", "Gn", "Gên", "Gen");
addVariants(2, "Êxodo", "Exodo", "Êx", "Ex", "Êxo");
// ... (todos os 66 livros — ver implementação completa em build_vault.py)
addVariants(19, "Salmos", "Salmo", "Salm", "Sal", "Sl");
addVariants(20, "Provérbios", "Proverbios", "Prov", "Pro", "Pv");
addVariants(40, "Mateus", "Mat", "Mt");
addVariants(43, "João", "Joao", "Jo");
addVariants(45, "Romanos", "Rom", "Rm");
addVariants(66, "Apocalipse", "Apoc", "Apo", "Ap", "Rev");

// Importante: ordenar variantes por TAMANHO DESC para casar nomes longos antes de curtos
const sortedVariants = Object.keys(BOOK_VARIANTS).sort((a, b) => b.length - a.length);
const bookPat = sortedVariants.map(escapeRegex).join('|');

const REF_REGEX = new RegExp(
  `(?<![\\wáéíóúÁÉÍÓÚâêîôûÂÊÎÔÛçÇ])` +    // não dentro de palavra
  `(?<book>${bookPat})` +
  `\\.?\\s*` +                              // ponto/espaço opcional
  `(?<chap>\\d{1,3})` +                     // capítulo
  `[:.]` +                                   // separador
  `(?<verses>\\d{1,3}(?:\\s*[\\-,]\\s*\\d{1,3})*)`,  // verso(s)
  'gi'
);
```

**Casos cobertos:**
- `Apocalipse 21:3` ✓
- `Apoc. 21:3-5,7` ✓ (intervalos e listas)
- `Sl 23:1` ✓ (abreviações)
- `Ap 1:8` ✓
- `Apocalipse 21,3` ✓ (vírgula em vez de dois pontos — formato europeu)
- `(Apocalipse 21:3)` ✓ (entre parênteses)

**Falsos positivos a mitigar:**
- "23:1" como horário: mitigado exigindo nome de livro válido antes
- "Mt 5" sem versículo: ignorado (regex exige `:` ou `.`)
- Capítulo > 150 ou versículo > 200: filtrado como inválido

**Expansão de intervalos:**

```typescript
function expandVerses(versesStr: string): number[] {
  const out: number[] = [];
  for (const token of versesStr.split(',').map(s => s.trim())) {
    if (token.includes('-')) {
      const [a, b] = token.split('-').map(Number);
      if (b > a && b - a <= 50) {
        for (let i = a; i <= b; i++) out.push(i);
      } else {
        out.push(a);
      }
    } else {
      out.push(Number(token));
    }
  }
  return out.filter(v => !isNaN(v) && v >= 1 && v <= 200);
}
```

### 6.2 Criação de versículos atômicos faltantes

Para cada `(book, chap, vers)` único detectado, criar arquivo em `Bíblia/<Livro>/<Livro X.Y>.md` se ainda não existir, com frontmatter `status: faltante-tnm` (campo TNM vazio para preenchimento posterior).

### 6.3 Bloco "Versículos citados" nas notas legadas

Para cada nota legada que mencione versículos, adicionar (idempotentemente) um bloco no final:

```markdown
<!-- BIBLE-LINKS-AUTO -->
## Versículos citados

*Detectados automaticamente. Edite manualmente se algum estiver incorreto.*

- [[Apocalipse 21.3|Apocalipse 21:3]]
- [[Salmo 23.1|Salmo 23:1]]
<!-- /BIBLE-LINKS-AUTO -->
```

**Marcadores HTML são essenciais para idempotência:** se rodar de novo, o regex substitui o bloco entre marcadores em vez de duplicá-lo.

```typescript
function applyBibleLinksBlock(content: string, refs: Reference[]): string {
  const block = renderBlock(refs);
  if (content.includes(MARKER_START) && content.includes(MARKER_END)) {
    return content.replace(
      new RegExp(`${escapeRegex(MARKER_START)}[\\s\\S]*?${escapeRegex(MARKER_END)}`),
      block
    );
  }
  return content.trimEnd() + '\n\n' + block + '\n';
}
```

### 6.4 Resultados reais (caso Marcel)

| Métrica | Valor |
|---|---|
| Notas legadas escaneadas | 2.005 |
| Menções a versículos detectadas | 7.271 |
| Versículos únicos referenciados | 3.643 |
| Versículos atômicos criados | 3.617 |
| Notas legadas com bloco adicionado | 1.396 |
| Top livro por densidade | Salmos (714 versículos únicos) |

---

## 7. Otimizações pós-importação

### 7.1 Sub-divisão de pastas grandes

Pastas com >300 arquivos lentificam o file explorer no Obsidian Mobile. Para Salmos (que normalmente acumula >500 versículos atômicos), subdividir por centenas:

```
Bíblia/Salmos/
├── 001-050/
├── 051-100/
└── 101-150/
```

Wikilinks `[[Salmos 23.1]]` continuam funcionando porque Obsidian resolve por nome de arquivo, não path.

### 7.2 Configurações Obsidian recomendadas

Atualizar `.obsidian/app.json` automaticamente (com backup):

```json
{
  "userIgnoreFilters": [
    "_Relatórios/",
    "Templates/"
  ],
  "showLineNumber": false,
  "readableLineLength": true,
  "strictLineBreaks": false,
  "nativeMenus": true,
  "showInlineTitle": true,
  "fileSortOrder": "alphabetical",
  "showUnsupportedFiles": false
}
```

Criar `.obsidianignore` na raiz do vault:

```
_Relatórios/
JW Library Backup/
.trash/
.DS_Store
*.bak
```

### 7.3 Mobile (iOS/iPadOS)

Recomendações que o app deve mostrar ao usuário ao final do export:

1. **iCloud "Optimize Storage" OFF** — sem isso, vault baixa sob demanda e cada nota gera latência
2. **"Manage plugins separately for mobile"** ativado no Obsidian Mobile
3. **Desabilitar plugins pesados no mobile** — Smart Connections, Excalidraw, Whisper
4. **Usar `Espiritual Mobile.md`** como Home no mobile (queries reduzidas)
5. **Force Reload** após import (Settings → About → Force Reload)
6. **Considerar Obsidian Sync** ($4-10/mês) para vaults com >5.000 arquivos — sync delta é dramaticamente mais rápido que iCloud Drive

---

## 8. Decisões de design

### 8.1 Frontmatter sobre tags inline

Optei por `tags: [...]` em frontmatter YAML em vez de `#tag` inline. Razões:
- Permite consulta via Dataview (`FROM #tag` funciona com ambos, mas filtros estruturados precisam de YAML)
- Mais limpo no editor
- Não polui graph view com nodes de tag

### 8.2 Hierarquia de tags com prefixo de categoria

`#tema/entendimento` em vez de `#entendimento`. Razões:
- Obsidian agrupa naturalmente em árvore hierárquica
- Evita colisão (pode existir `#sentinela` como publicação E como tema)
- Facilita queries (`startswith(tag, "tema/")`)

### 8.3 Versículo atômico apenas para refs reais

Não criar versículo atômico para toda a Bíblia (31.000+ versículos seria absurdo). Criar apenas para versículos que aparecem em notas pessoais ou em referências detectadas.

### 8.4 Não-destrutivo por princípio

Nunca apagar conteúdo escrito pelo usuário. Sempre adicionar em seções marcadas (`<!-- BIBLE-LINKS-AUTO -->`) que são idempotentes.

### 8.5 Naming com ponto em vez de dois-pontos

`Apocalipse 21.3.md` em vez de `Apocalipse 21:3.md`. Razões:
- `:` é proibido em alguns filesystems (FAT32, exFAT que iCloud Drive usa internamente)
- Compatível com Windows, macOS, Linux, iOS

### 8.6 KeySymbol como dimensão separada de book

KeySymbol (`w`, `mwb`) e BookNumber (1-66) são ortogonais. Uma nota pode ter ambos (ex: artigo da Sentinela que comenta versículo bíblico). Salvar ambos no frontmatter.

---

## 9. Roadmap sugerido para `jwlbackup`

### 9.1 Feature: Exportador para Obsidian

**MVP (versão 1):**

1. Tela "Export to Obsidian" no app
2. Botão de seleção de folder destino (Show Directory Picker API)
3. Opções:
   - [x] Notas pessoais
   - [x] Versículos atômicos (apenas refs)
   - [x] MOCs por tag
   - [x] Templates
   - [x] Home page
   - [ ] Destaques (UserMark) — opcional
   - [ ] Bookmarks — opcional
4. Preview do resultado (quantos arquivos serão criados, distribuição)
5. Geração + download como zip OU escrita direta no folder

**Versão 2:**

6. Reconciliação com vault existente:
   - Usuário aponta para folder do vault Obsidian existente
   - App escaneia folder, detecta refs bíblicas em notas existentes
   - Cria versículos atômicos faltantes
   - Adiciona blocos `<!-- BIBLE-LINKS-AUTO -->`
7. Customização:
   - Mapeamento Tag JW → categoria (UI)
   - Naming convention configurável
   - Estrutura de folders configurável

**Versão 3:**

8. Sync incremental: rodar de novo apenas arquivos novos/modificados
9. Geração de relatório de exame (saúde do vault)
10. Otimização automática (subdividir pastas grandes, atualizar .obsidian/app.json)

### 9.2 UX recomendada (passo a passo)

```
┌─────────────────────────────────────────────────────────┐
│  Step 1: Upload your .jwlibrary backup                  │
│  ┌─────────────────────────────────────┐               │
│  │  [Drop .jwlibrary file here]         │               │
│  └─────────────────────────────────────┘               │
│                                                          │
│  ✓ Detected: 3,223 notes, 35 tags, 44,480 highlights   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Step 2: Configure tags                                  │
│  ┌─────────────────────────────────────┐               │
│  │  Tag: Jeová Deus       [pessoa  ▼]  │               │
│  │  Tag: Entendimentos    [tema    ▼]  │               │
│  │  Tag: Tesouros da Angie [colecao▼]  │               │
│  │  ...                                  │               │
│  └─────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Step 3: Choose what to export                           │
│  [x] Personal notes (3,223 files)                        │
│  [x] Atomic verses (auto, ~500 files)                    │
│  [x] MOCs (29 files, one per tag)                        │
│  [x] Home + Templates                                     │
│  [ ] Highlights as separate notes (44,480 — heavy!)      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Step 4: Choose destination                              │
│  ○ Download as ZIP (open anywhere)                       │
│  ● Write directly to folder (requires browser permission)│
│    → [Choose folder...]                                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Step 5: Reconcile existing vault?                       │
│  [x] Yes — point to my Obsidian vault folder             │
│      → [Choose vault folder...]                          │
│      ✓ Detected 2,005 existing notes                     │
│      Will scan for Bible references and add cross-links  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Step 6: Review & Export                                 │
│  Files to create: 3,803                                   │
│  Files to update: 1,396 (with marker block)              │
│  Estimated size: ~10 MB                                   │
│                                                          │
│  [Export]                                                │
└─────────────────────────────────────────────────────────┘
```

### 9.3 Implementação em Svelte/TS

**Bibliotecas sugeridas (já viáveis no browser):**

```json
{
  "dependencies": {
    "sql.js": "^1.10.0",          // SQLite no browser
    "fflate": "^0.8.0",           // unzip leve
    "yaml": "^2.4.0"              // serializar frontmatter
  }
}
```

**API do File System Access (para escrita direta no vault):**

```typescript
async function writeToVault(handle: FileSystemDirectoryHandle, files: ExportedFile[]) {
  for (const file of files) {
    const parts = file.path.split('/');
    let dir = handle;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file.content);
    await writable.close();
  }
}
```

**Limitação:** API de File System Access funciona em Chrome/Edge mas não em Safari (até 2026). Fallback para download .zip via `fflate` em Safari.

**Estrutura de stores Svelte:**

```typescript
// stores/jwlibrary.ts
export const db = writable<sqlJs.Database | null>(null);
export const notes = derived(db, $db => $db ? loadNotes($db) : []);
export const tags = derived(db, $db => $db ? loadTags($db) : []);

// stores/export.ts
export const tagMappings = writable<Map<string, TagMapping>>(new Map());
export const exportOptions = writable<ExportOptions>({ ... });
export const reconcileVaultHandle = writable<FileSystemDirectoryHandle | null>(null);

// services/exporter.ts
export async function exportToObsidian(
  db: sqlJs.Database,
  options: ExportOptions,
  destination: FileSystemDirectoryHandle | 'zip'
): Promise<ExportResult> { ... }
```

### 9.4 Privacidade — manter como diferencial

O app já é "private, local, open source" (per README). Manter isso na feature de export:

- **Nada vai para servidor** — toda transformação client-side
- **Sem analytics na funcionalidade de export** — o usuário pode exportar dados sensíveis (tags pessoais como nome da esposa, reflexões íntimas)
- **Documentar publicamente** o que é processado e onde fica

---

## 10. Métricas reais — caso Marcel (referência)

| Etapa | Tempo | Output |
|---|---|---|
| Extração SQLite + análise inicial | 5 min | Schema mapeado, contagens, samples |
| Geração inicial (notas + MOCs + Home + versículos Apocalipse + templates) | 3,7s | 3.290 arquivos |
| Reconciliação (escaneamento legado + criação de versículos atômicos + bloco "Versículos citados") | ~30s | 3.617 versículos novos, 1.396 notas atualizadas |
| Cleanup de plugins + refactor Salmos | ~2s | 9 plugins desinstalados, 15,2 MB liberados, Salmos em 3 subpastas |
| **Total do pipeline** | **<10 min** | **8.913 notas em vault funcional** |

| Volume de dados | |
|---|---|
| Tamanho do `.jwlibrary` | 6,2 MB |
| Tamanho do vault gerado | 9,9 MB |
| Razão dados pessoais / metadados | ~80/20 |

---

## 11. Limitações conhecidas

### 11.1 Não cobre

- **Texto da TNM (Bíblia) em massa** — copiar texto bíblico das publicações JW levanta questão de copyright para distribuição em massa. Solução: deixar campo vazio, preencher sob demanda quando o usuário usar.
- **Imagens incorporadas** — `.jpg`/`.png` dentro do `.jwlibrary` não foram exportadas nesta versão.
- **Highlights (UserMark)** — 44.480 destaques não foram convertidos em notas individuais (geraria muito ruído). Possível extensão: agregá-los como blocos dentro da nota da publicação correspondente.
- **Playlists** — tabelas `PlaylistItem*` não foram processadas.
- **Comentários em mídia** — `IndependentMedia` table não foi processada.

### 11.2 Possíveis problemas

- **Encoding** — caracteres unicode raros (NBSP, NNBSP) presentes no Title das notas. Necessário normalizar.
- **Conflito de nomes** — duas notas com mesmo Title gerariam mesmo filename. Solução: sufixar com NoteId.
- **KeySymbols não mapeados** — backups antigos podem ter KeySymbols obsoletos. Fallback genérico necessário.
- **Tag JW com caracteres especiais** — slug agressivo pode perder semântica. UI deve permitir override manual.
- **Idempotência da reconciliação** — exige marcadores HTML estáveis (`<!-- BIBLE-LINKS-AUTO -->`).

### 11.3 Não testado em escala

- Backups com >100.000 notas (caso extremo)
- Backups multilíngues (notas em PT-BR + EN no mesmo backup)
- Backups corrompidos parcialmente

---

## 12. Anexo: estrutura final do vault gerado (caso Marcel)

```
0 Projetos/Espiritual/
├── Espiritual.md                         (Home, com dashboards Dataview)
├── Espiritual Mobile.md                  (Home leve para iPhone/iPad)
├── Templates/                            (4 templates)
│   ├── T-NotaJW.md
│   ├── T-Versiculo.md
│   ├── T-MOC.md
│   └── T-Pessoa.md
├── _MOCs/                                (28 MOCs)
│   ├── MOC - Entendimentos.md
│   ├── MOC - Ser cristão.md
│   └── ...
├── _Relatórios/                          (relatórios de execução)
│   ├── Exame do Vault - 2026-04-30_2141.md
│   ├── Otimização Mobile - 2026-04-30_2150.md
│   └── Cleanup e Refactor - 2026-05-01_0757.md
├── Bíblia/                               (3.643 versículos atômicos)
│   ├── Apocalipse/                       (33 versículos)
│   ├── Salmos/
│   │   ├── 001-050/                      (~230 versos)
│   │   ├── 051-100/                      (~240)
│   │   └── 101-150/                      (~244)
│   ├── Provérbios/                       (343)
│   ├── Isaías/                           (286)
│   ├── Mateus/                           (269)
│   └── ... (todos os livros referenciados)
└── JW Library/
    └── Notas/                            (3.222 notas pessoais)
        ├── Bíblia/<Livro>/
        └── Publicações/<Pub>/
```

Total: **8.913 notas .md, 9,9 MB, 100% navegável por wikilinks e tags hierárquicas.**

---

*Documento criado em 2026-05-01. Pipeline original implementado em Python (`build_vault.py`, `reconciliacao_e_exame.py`, `cleanup_e_refactor.py`). Reimplementação em Svelte/TypeScript para web fica como roadmap do app `jwlbackup`.*
