# Estudo Arquitetural — Exportador Obsidian no `jwlbackup`

> Documento de design (não código) escrito antes da reimplementação da feature de export Obsidian. Posiciona-se entre a SPEC original (pipeline Python que rodou em 30/04–01/05/2026) e a implementação Svelte/TS atual (`src/lib/obsidian/`), e propõe a forma final.
>
> **Princípio rector:** *a melhor e mais simples estrutura de exportação possível, sem perder o que torna a feature útil*.

---

## 1. Lente de simplicidade

Toda decisão deste documento passa por três perguntas:

1. **Isso aparece no vault do usuário?** Se sim, tem que valer o ruído visual.
2. **Isso está no caminho crítico de "abro o JW backup → vejo notas no Obsidian"?** Se não, é V2/V3.
3. **Existe versão mais curta com 90% do valor?** Se existe, é a versão que vai pro V1.

Aplicar essa lente já elimina ~40% do que o exporter atual faz.

---

## 2. Modelo mental: cinco camadas

A confusão no código atual vem de um único arquivo (`exporter.ts`) que sabe sobre **fonte de dados (JW)** *e* **destino (Obsidian)** ao mesmo tempo. Separar em camadas dá clareza pra cada feature encaixar onde pertence.

```
┌─────────────────────────────────────────────────────────┐
│  L1  SOURCE                                              │
│  .jwlibrary file(s)  →  Archive (DB unificado)          │
│  · 1 ou N arquivos, dedup por Guid                       │
│  · LastModified mais recente vence em conflito           │
│  · Pura camada de dados, zero conceito de Obsidian       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  L2  CURATE                                              │
│  Archive  →  Curated dataset                             │
│  · Tag mapping: rename · merge · recategorize            │
│  · Filter: quais notas/tags vão entrar                   │
│  · Persistência: localStorage (reusa em export futuro)   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  L3  PROJECT                                             │
│  Curated dataset  →  Vault representation (em memória)   │
│  · UMA fonte de verdade do schema (frontmatter+folders)  │
│  · Função pura, sem I/O                                  │
│  · Saída: Map<path, content>                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  L4  WRITE                                               │
│  Vault representation  →  Disk (ZIP ou pasta)            │
│  · Writer ZIP (fflate) — fallback universal              │
│  · Writer FS Access — escrita direta + reconciliação     │
│  · Reconciliação: scan vault legado, regex bíblico,      │
│    bloco BIBLE-LINKS-AUTO idempotente                    │
└─────────────────────────────────────────────────────────┘
                          ↓ (opcional, V3)
┌─────────────────────────────────────────────────────────┐
│  L5  AUGMENT                                             │
│  Vault representation × LLM  →  Vault representation+    │
│  · BYOK (Bring Your Own Key)                             │
│  · Opt-in explícito por nota ou em batch                 │
│  · Bloco STUDY-AI-AUTO idempotente                       │
└─────────────────────────────────────────────────────────┘
```

**Por que essa divisão funciona:** cada camada testa-se isolada, cada feature nova encaixa numa só, e a complexidade fica contida. Hoje, `exporter.ts` mistura L3 + L4; `sync.ts` mistura L4 + um pouco de L3.

---

## 3. O que pode SAIR do código atual (primeira passada de poda)

| Está em `exporter.ts` hoje | Proposta | Por quê |
|---|---|---|
| `jw_content_hash` (FNV-1a inline) | **Remover** | Redundante com `modified` (timestamp do JW). Comparação por timestamp é suficiente pra detectar mudança. |
| `sync_strategy: controlled-block` | **Remover** | Constante sem propósito. Nunca varia. Polui frontmatter. |
| `jw_exported_at` em cada nota | **Remover** do frontmatter, mover pra relatório | Info sobre o EVENTO (export), não sobre a NOTA. Só polui. |
| Pasta `/{ano}/` dentro de `JW Library/Notas/Bíblia/<Livro>/` | **Remover** | Quando você edita uma nota o ano dela "muda" sem motivo. Sem ganho de navegação real. |
| `<!-- JWL:BEGIN -->` / `<!-- JWL:END -->` | **Manter, mas esconder do usuário casual** (V2, ver §7) | Tem valor real pra reconciliação. Mas a AMOSTRA mostra que o estilo do Marcel é nota inteira editável — então o uso correto é bloco "BIBLE-LINKS-AUTO" em notas legadas, e nas notas geradas pelo export o sync usa `note-id` no frontmatter como âncora. |
| `tipo: nota-jw-library` | **Renomear** pra `tipo: nota-jw` | AMOSTRA usa o curto. Mais natural. |
| `referencia: "Isaías 56:4-5"` (string) | **Substituir** por campos estruturados (`livro`, `capitulo`, `versiculo`) | Dataview filtra por campo, não por string. AMOSTRA já faz isso. |
| `tags: [jw-library, tema/X]` | **Substituir** por hierarquia completa: `[tipo/nota-jw, livro/at/X, tema/Y, fonte/biblia]` | AMOSTRA usa hierarquia rica. Permite slice em múltiplas dimensões. |
| `JW Library/MOCs/<tag>.md` | **Mover** pra `_MOCs/MOC - <Tema>.md` | Underline-prefixo coloca no topo do file explorer. AMOSTRA usa esse padrão. |

**Saldo da poda:** frontmatter cai de ~13 campos pra ~8 nas notas bíblicas, ~8 nas de publicação. Folders ficam mais rasos. O usuário enxerga menos, e cada coisa que vê tem propósito claro.

---

## 4. Schema final proposto

### 4.1 Frontmatter

**Nota bíblica (BlockType=2):**
```yaml
---
tipo: nota-jw
fonte: jw-library
livro: Isaías
capitulo: 56
versiculo: "4-5"          # string sempre, suporta intervalos e listas
testamento: AT
key-symbol: nwtsty
created: 2026-04-29T15:53:38Z
modified: 2026-04-29T12:54:53-03:00
note-id: 3319
note-guid: ABC123-...      # estável entre backups, base do sync
versiculo-base: "[[Isaías 56.4-5]]"   # link pro atomic verse
tags-jw: [Entendimentos]   # raw original do JW Library
tags: [tipo/nota-jw, livro/at/isaias, tema/entendimento, fonte/biblia]
marcacao: amarelo          # opcional, vem do UserMark.ColorIndex
---
```

**Nota de publicação:**
```yaml
---
tipo: nota-jw
fonte: jw-library
publicacao: A Sentinela (Estudo)
key-symbol: w
issue: 202401              # YYYYMM
documento: 2024123         # opcional
paragrafos: "5,7-9"        # opcional
created: 2026-02-10T...
modified: ...
note-id: 1234
note-guid: ...
tags-jw: [Princípios]
tags: [tipo/nota-jw, fonte/pub/sentinela, tema/principios]
---
```

### 4.2 Estrutura de pastas

```
<vault-root>/
├── Espiritual.md                             ← Home (Dataview)
├── Espiritual Mobile.md                      ← Home leve para mobile
├── Templates/
│   ├── T-NotaJW.md
│   ├── T-Versiculo.md
│   ├── T-MOC.md
│   └── T-Pessoa.md
├── _MOCs/                                    ← topo do file explorer
│   ├── MOC - Entendimentos.md
│   └── ...
├── Bíblia/
│   ├── Apocalipse/
│   │   ├── Apocalipse 21.3.md                ← atomic verse
│   │   └── ...
│   ├── Salmos/                               ← subdivide se >300 arquivos
│   │   ├── 001-050/
│   │   └── ...
│   └── Mapa de Apocalipse.md                 ← book MOC
└── JW Library/
    └── Notas/
        ├── Bíblia/<Livro>/<NotaSlug>.md      ← sem subpasta de ano
        └── Publicações/<Pub>/<NotaSlug>.md
```

Sem `/{ano}/`. Sem `JW Library/MOCs/`. Sem `JW Library/Conflitos/` (vai pra `_Conflitos/` na raiz se acontecer).

### 4.3 Naming convention

| Tipo | Padrão | Exemplo |
|---|---|---|
| Atomic verse | `<Livro> <Cap>.<Vers>.md` | `Apocalipse 21.3.md` |
| Nota JW (versículo) | `<Livro> <Cap>.<Vers> — <título>.md` | `Isaías 56.4-5 — Promessa aos eunucos.md` |
| Nota JW (capítulo) | `<Livro> <Cap> — <título>.md` | `Apocalipse 21 — Nova Jerusalém.md` |
| Nota JW (publicação) | `<PubShort> — <título>.md` | `Sentinela 26.01 — espera ansiosa.md` |
| MOC | `MOC - <Tema>.md` | `MOC - Entendimentos.md` |
| Mapa de livro | `Mapa de <Livro>.md` | `Mapa de Apocalipse.md` |

Sanitização: `:` → `.`; remover `/\*?"<>|`; NBSP→espaço; cap. 80 chars; sufixo `(NoteId)` em colisão.

### 4.4 Tags hierárquicas

| Categoria | Prefixo | Exemplos |
|---|---|---|
| Tipo (sempre presente) | `tipo/` | `tipo/nota-jw`, `tipo/atomic-verse`, `tipo/moc` |
| Livro bíblico (se aplicável) | `livro/at/` ou `livro/nt/` | `livro/at/isaias`, `livro/nt/apocalipse` |
| Tema (sugerido pela tag JW) | `tema/` | `tema/entendimento`, `tema/principios` |
| Pessoa | `pessoa/` | `pessoa/jeova`, `pessoa/jesus` |
| Fonte | `fonte/` | `fonte/biblia`, `fonte/pub/sentinela` |
| Coleção (opcional) | `colecao/` | `colecao/tesouros-da-angie` |
| Discurso numerado | `discurso/` | `discurso/12` |

A categorização final fica a cargo do **editor de tags (L2)**, com defaults inteligentes via heurística.

---

## 5. Onde cada feature encaixa (matriz feature × camada)

| Feature | L1 Source | L2 Curate | L3 Project | L4 Write | L5 Augment |
|---|:---:|:---:|:---:|:---:|:---:|
| Read .jwlibrary | ● | | | | |
| **Mesclar N backups (NOVA)** | ● | | | | |
| Filter notas/tags (export ou não) | | ● | | | |
| **Tag mapping/rename/merge (NOVA)** | | ● | | | |
| Persistência do mapeamento | | ● | | | |
| Gerar nota pessoal | | | ● | | |
| Gerar atomic verse | | | ● | | |
| Gerar MOC por tag | | | ● | | |
| Gerar Espiritual.md / Mobile | | | ● | | |
| Gerar Templates | | | ● | | |
| Gerar Mapa de Livro | | | ● | | |
| Subdividir pasta grande | | | ● | | |
| Saída ZIP | | | | ● | |
| Saída pasta (FS Access) | | | | ● | |
| Sync vault existente (notas geradas) | | | | ● | |
| **Reconciliação notas legadas (V2)** | | | | ● | |
| Relatório de execução | | | | ● | |
| **Estudos breves via API (NOVA, V3)** | | | | | ● |

Três features novas, cada uma na sua camada, cada uma sem sangrar nas outras.

---

## 6. UX proposta — wizard de 4 passos

A spec original tem 6 passos. A versão simplificada compacta sem perder informação:

```
┌─────────────────────────────────────────────────────────────┐
│  [1/4]  Carregar backups                                     │
│                                                              │
│  [⬇ Solte 1 ou mais .jwlibrary aqui]                        │
│                                                              │
│  iPad — 30/04/2026 ✓  3.223 notas, 35 tags, 44.480 marcações│
│  iPhone — 27/04/2026 ✓  3.198 notas, 35 tags, 44.011 marc.  │
│                                                              │
│  Após mesclagem por GUID:                                    │
│    3.245 notas únicas (+22 só no iPad, +14 só no iPhone)    │
│    35 tags                                                   │
│                                                              │
│                                       [Próximo →]            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  [2/4]  Etiquetas                                            │
│                                                              │
│  Marcel revisar/ajustar antes de exportar.                   │
│                                                              │
│  Tag JW                Categoria        Slug                 │
│  ───────────────────── ──────────────  ──────────────────   │
│  Entendimentos         [tema       ▼]  entendimento          │
│  Jeová Deus            [pessoa     ▼]  jeova                 │
│  Tesouros da Angie     [coleção    ▼]  tesouros-da-angie    │
│  Discurso 12           [discurso   ▼]  12                    │
│  ...                                                         │
│                                                              │
│  ☑ Salvar este mapeamento (reusar no próximo export)        │
│                                                              │
│                              [← Voltar]   [Próximo →]        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  [3/4]  O que exportar                                       │
│                                                              │
│  ☑ Notas pessoais             3.245 → 3.245 .md             │
│  ☑ Versículos atômicos         (apenas referenciados, ~500)  │
│  ☑ MOCs por etiqueta           35 → 35 .md                   │
│  ☑ Templates + Home            6 .md                         │
│  ☐ Marcações (UserMark)        44.491 — gera ruído!          │
│  ☐ Favoritos (Bookmark)        40                            │
│                                                              │
│  Total estimado: 3.821 arquivos · ~10 MB                     │
│                                                              │
│                              [← Voltar]   [Próximo →]        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  [4/4]  Destino                                              │
│                                                              │
│  ○ Baixar ZIP (universal, abre em qualquer lugar)            │
│  ● Escrever direto na pasta (Chrome/Edge)                    │
│      ↳ Pasta: /Users/marcel/Obsidian/Espiritual              │
│      ☑ Reconciliar notas legadas existentes                  │
│        (escaneia 2.005 notas, adiciona links bíblicos)       │
│                                                              │
│                              [← Voltar]   [Exportar]         │
└─────────────────────────────────────────────────────────────┘
```

**Defaults inteligentes:**
- Tag mapping vem pré-preenchido com heurística (`suggestCategory`)
- "Versículos atômicos" e "MOCs" vêm marcados
- "Marcações" e "Favoritos" desmarcados (ruído por default)
- Reconciliação só aparece se Marcel já escolheu pasta com vault existente

---

## 7. V2 — Reconciliação de notas legadas

Esta é a parte mais inovadora da feature. É o passo que fez 2.005 notas legadas no vault do Marcel ganharem 7.271 cross-links automáticos.

### 7.1 Mecânica

```
1. Usuário escolhe pasta do vault Obsidian existente
2. App escaneia recursivamente, ignora _MOCs/, Bíblia/, JW Library/, .obsidian/
3. Em cada .md restante:
     a) Lê o texto
     b) Roda REF_REGEX → lista de (livro, cap, vers)
     c) Filtra falsos positivos (capítulo>150, verso>200)
     d) Cria/atualiza bloco BIBLE-LINKS-AUTO no final do arquivo
4. Cria atomic verses faltantes em Bíblia/<Livro>/
5. Gera relatório em _Relatórios/Reconciliação YYYY-MM-DD HHMM.md
```

### 7.2 Bloco idempotente

O bloco que vai pra cada nota legada tem **delimitadores HTML** para que rodar duas vezes não duplique:

```markdown
<!-- BIBLE-LINKS-AUTO -->
## Versículos citados

*Detectados automaticamente. Edite manualmente se algum estiver incorreto.*

- [[Apocalipse 21.3|Apocalipse 21:3]]
- [[Salmo 23.1|Salmo 23:1]]
<!-- /BIBLE-LINKS-AUTO -->
```

Lógica de update: regex pelo bloco entre marcadores; substitui o miolo; preserva tudo fora.

### 7.3 Regex robusto

`bible.ts` precisa ganhar um mapa de variantes de nome. Cobertura mínima recomendada (PT-BR):

```typescript
const VARIANTS: Record<string, number> = {};
const add = (n: number, ...names: string[]) =>
  names.forEach(s => VARIANTS[s.toLowerCase()] = n);

add(1, "Gênesis", "Genesis", "Gn", "Gên", "Gen");
add(19, "Salmos", "Salmo", "Salm", "Sal", "Sl");
add(20, "Provérbios", "Proverbios", "Prov", "Pv");
add(40, "Mateus", "Mat", "Mt");
add(43, "João", "Joao", "Jo");
add(45, "Romanos", "Rom", "Rm");
add(66, "Apocalipse", "Apoc", "Apo", "Ap", "Rev");
// ... 66 entradas, todas as variantes razoáveis
```

Regex (escapa, ordena por tamanho desc, monta uma alternância):

```typescript
const REF_REGEX = new RegExp(
  String.raw`(?<![\wáéíóúÁÉÍÓÚâêîôûÂÊÎÔÛçÇ])` +
  `(?<book>${SORTED_NAMES.map(escapeRE).join('|')})` +
  String.raw`\.?\s*` +
  String.raw`(?<chap>\d{1,3})` +
  String.raw`[:.]` +
  String.raw`(?<verses>\d{1,3}(?:\s*[\-,]\s*\d{1,3})*)`,
  'gi'
);
```

Cobre `Apocalipse 21:3`, `Apoc. 21:3-5,7`, `Sl 23:1`, `Ap 1:8`, `Apocalipse 21,3`, `(Apocalipse 21:3)`. Mitiga falso positivo de hora (`23:1`) por exigir nome de livro válido antes.

### 7.4 Volume esperado

No caso do Marcel: 2.005 notas legadas → 7.271 menções → 3.643 versículos únicos → 3.617 atomic verses criados. Tempo de processamento Python original: ~30s. Em browser via JS deve ser comparável (regex é o mesmo motor V8).

---

## 8. V3 — Estudos breves via API

### 8.1 Casos de uso priorizados

1. **Atomic verse vazio** (`status: faltante-tnm`) — gerar contexto histórico em ~150 palavras + 3 versículos paralelos sugeridos
2. **MOC novo sem texto** — gerar pergunta-âncora + 5 conexões temáticas com versículos centrais
3. **Nota com `Title` mas `Content` curto/vazio** — sugerir 1 reflexão pessoal pra preencher

### 8.2 Privacy-first design

O app é "100% local, nada vai pra servidor". Adicionar API quebra isso, então o desenho TEM que ser:

- **Opt-in explícito por ação** — botão "Sugerir estudo" em cada nota; nunca rodar automaticamente
- **BYOK** — usuário cola sua própria API key (Claude/OpenAI/local LLM via OpenAI-compatible endpoint), guardada apenas em localStorage
- **Sem proxy** — request browser→API direto; nunca passa pelo servidor do `jwlbackup`
- **Aviso visual claro** — antes de mandar, mostra: *"Apenas o conteúdo desta nota vai para [provider]. Sua API key fica só neste navegador."*
- **Bloco isolado** — `<!-- STUDY-AI-AUTO -->` ... `<!-- /STUDY-AI-AUTO -->`, idempotente, removível com 1 clique

### 8.3 Privacy-aware schema

O bloco gerado vai com proveniência:

```markdown
<!-- STUDY-AI-AUTO -->
## Sugestão de estudo

> Gerado por **claude-sonnet-4-6** em 2026-05-02. Edite, refine, refute.

**Contexto histórico:** ...

**Versículos paralelos:**
- [[Isaías 56.6]]
- [[Lucas 23.43]]
- [[Mateus 19.12]]

**Pergunta-âncora:** ...
<!-- /STUDY-AI-AUTO -->
```

A proveniência permite ao usuário rastrear o que veio de IA vs. o que escreveu, e re-gerar com modelo diferente se quiser.

### 8.4 Não-objetivos do V3

- **Não** gerar texto da TNM (problema de copyright; fica `status: faltante-tnm`)
- **Não** rodar em batch sem confirmação (custo + qualidade descontrolada)
- **Não** integrar com servidor da Anthropic via SDK do `jwlbackup` — sempre BYOK

---

## 9. Modularização proposta no código

```
src/lib/
├── jwlibrary.ts                    (existe)  Read .jwlibrary, sql.js
├── bible.ts                        (existe + amplia) +VARIANTS, +REF_REGEX
├── publications.ts                 (existe)  KeySymbol → label
├── markdown.ts                     (existe)  safeFilename
├── refs.ts                         (existe)  resolveRef
│
├── archive/                        ─── NOVO ─── L1 Source
│   ├── index.ts                    Archive class (1+N DBs, dedup por Guid)
│   └── merge.ts                    Resolução de conflito (LastModified vence)
│
├── curate/                         ─── NOVO ─── L2 Curate
│   ├── tags.ts                     Tag editor: rename, merge, recategorize
│   ├── persistence.ts              localStorage de mapeamento
│   └── filters.ts                  Quais notas/tags exportar
│
├── obsidian/                       (refatora) L3 Project + L4 Write
│   ├── schema.ts                   ─── NOVO ─── verdade-fonte: frontmatter, folders, tags, naming
│   ├── projector.ts                (era exporter.ts)  pure transform → Map<path, content>
│   ├── writer-zip.ts               (extrai do exporter.ts)  fflate
│   ├── writer-fs.ts                (era sync.ts)  FS Access API
│   └── reconcile.ts                ─── NOVO ─── V2: regex + BIBLE-LINKS-AUTO
│
└── studies/                        ─── NOVO (V3) ─── L5 Augment
    ├── api.ts                      BYOK + provider abstraction
    ├── prompts.ts                  Templates de prompt por caso de uso
    └── insertion.ts                Bloco STUDY-AI-AUTO idempotente
```

E na UI:

```
src/lib/components/
├── ObsidianPanel.svelte            (refatora em wizard)
└── obsidian/                       ─── NOVO ───
    ├── Step1Upload.svelte          múltiplos backups, mostra mesclagem
    ├── Step2Tags.svelte            editor de tags com heurística
    ├── Step3Options.svelte         o que exportar (toggles)
    ├── Step4Destination.svelte     ZIP / pasta / reconciliar
    └── ResultPanel.svelte          relatório pós-export
```

Cada arquivo abaixo de 200 linhas. Testabilidade alta: `projector.ts` testa-se isolado dando um `Curated` de exemplo e checando o `Map<path, content>`.

---

## 10. Plano de migração faseado

A grande tentação seria refatorar tudo num PR só. Vamos resistir.

### Fase 0 — Testes-âncora (1 sessão)
Antes de mudar qualquer coisa, escrever 5 testes-snapshot do exporter atual: rodar contra `claude/jwlibrary_extract/userData.db`, capturar 3 arquivos representativos (1 nota bíblica, 1 publicação, 1 atomic verse, 1 MOC, Espiritual.md). Esses snapshots servem de baseline para detectar regressões nas próximas fases.

### Fase 1 — Schema (1-2 sessões)
- Criar `src/lib/obsidian/schema.ts` com a verdade-fonte
- Reescrever frontmatter conforme §4.1 (poda + alinhamento com AMOSTRA)
- Reorganizar folders conforme §4.2 (sem `/{ano}/`, `_MOCs/` na raiz)
- Atualizar testes-âncora

**Saída:** vault gerado idêntico em estrutura ao vault Espiritual real do Marcel.

### Fase 2 — Tag editor (1-2 sessões)
- `src/lib/curate/tags.ts` com `suggestCategory` + heurística
- `src/lib/curate/persistence.ts` com localStorage
- Reescrever `ObsidianPanel.svelte` em wizard de 4 passos
- Step 2 (Tags) é o coração: dropdown por tag, reusa mapeamento prévio

**Saída:** primeiro ganho de UX visível pra outros usuários.

### Fase 3 — Mesclar backups (1 sessão)
- `src/lib/archive/index.ts` aceita 1+N DBs
- Dedup por Guid, LastModified vence
- Step 1 do wizard mostra estatísticas de mesclagem

**Saída:** caso de uso "iPad+iPhone" resolvido.

### Fase 4 — Reconciliação V2 (2-3 sessões)
- `bible.ts` ganha VARIANTS + REF_REGEX
- `src/lib/obsidian/reconcile.ts`: scan + regex + bloco idempotente
- Step 4 do wizard ativa quando pasta tem vault existente

**Saída:** o ganho real pra usuários com vault legado.

### Fase 5 — Estudos via API V3 (2-4 sessões)
- `src/lib/studies/` completo
- Settings de provider/key
- Botão "Sugerir estudo" no card da nota

**Saída:** capacidade premium opcional.

**Total estimado:** 8-13 sessões pra ter V1+V2+V3 em estado lançável.

---

## 11. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Refatoração quebra usuários atuais do `jwlbackup` que já exportaram com schema antigo | Fase 0 (snapshots) + nota no CHANGELOG.md + opção "schema legado" no wizard durante 2 minor versions |
| Tag mapping persistido no localStorage some quando usuário troca browser | Botão "Exportar mapeamento" → JSON; "Importar mapeamento" no Step 2 |
| Regex bíblico pega falso positivo em texto não-bíblico (ex: "Gen 23" em texto sobre genética) | Filtro de plausibilidade (Gn capítulo válido = 1-50, etc.); modo "preview e confirma" antes de aplicar |
| API do estudo gera baseado em má interpretação do versículo (heresia, especulação) | Prompt template com restrições explícitas; campo `provider` + `model` no bloco pra rastrear; botão "remover sugestão" sempre visível |
| Mesclar backups perde notas em conflito de Guid genuíno (raro) | Relatório de mesclagem mostra cada conflito resolvido com qual data venceu; `_Relatórios/Mesclagem.md` |
| File System Access API não disponível em Safari/iOS | ZIP universal já é fallback; adicionar aviso explícito no Step 4 |

---

## 12. Decisões pendentes (para Marcel responder)

Cada item abaixo pode mudar o desenho. Numerados pra resposta direta:

**D1.** Mantém `<!-- JWL:BEGIN -->` / `<!-- JWL:END -->` nas notas geradas pelo export, ou tira (e usa só `note-id` no frontmatter como âncora de sync)?
- (a) Manter (mais robusto contra edições no body)
- (b) Tirar (mais limpo, alinhado com AMOSTRA)
- (c) Tornar opcional via config

**D2.** Atomic verse vem com `status: faltante-tnm` por padrão (campo TNM vazio, esperando preenchimento manual ou V3), ou só com backlinks (atual)?
- (a) Sim, com status (alinha com SPEC)
- (b) Não, só backlinks (mais simples, não promete o que não entrega)

**D3.** O wizard de 4 passos substitui o painel atual ou convive?
- (a) Substitui (escolha forte)
- (b) Convive: "Modo Avançado" continua sendo o painel atual; "Modo Guiado" é o wizard novo

**D4.** Tag editor com persistência: localStorage ou IndexedDB?
- (a) localStorage (simples, ~5MB limite — sobra fácil pra 35-200 tags)
- (b) IndexedDB (preparado pra futuro, mais código)

**D5.** Mesclagem de backups: ordem de prioridade em conflito de Guid?
- (a) `LastModified` mais recente vence (proposta)
- (b) Usuário decide caso a caso (UI)
- (c) Sempre vence o último carregado

**D6.** V3 (estudos via API) entra no roadmap público do README ou fica escondido até estabilizar?
- (a) Já anuncia como "experimental"
- (b) Implementa e só anuncia quando maduro

**D7.** Manter pasta `claude/` no repo (que tem SPEC, AMOSTRA, ESTUDO, e o backup `.jwlibrary` extraído) ou mover esses docs pra `docs/` antes de tornar o repo público?
- Sugestão: mover SPEC/ESTUDO pra `docs/`; manter `claude/jwlibrary_extract/` em `.gitignore` (dados pessoais).

---

## 13. O que NÃO está no escopo deste estudo

- Texto da TNM em massa (copyright)
- Imagens/mídia incorporadas no `.jwlibrary`
- Playlists e `IndependentMedia`
- Sync bidirecional (Obsidian → JW Library) — JW não tem API pública
- Suporte multilíngue (PT-BR é o foco; EN/ES virão depois se houver demanda)

---

## 14. Próximo passo concreto

Marcel responde D1–D7 (poucas linhas, sem precisar reescrever o ESTUDO). Com isso definido, abrimos a **Fase 0 — Testes-âncora**: escrever os 5 snapshots do output atual como linha de partida, e seguir pra Fase 1 (schema).

*Documento criado em 2026-05-02 por Marcel + Claude (Cowork mode), pré-implementação.*
