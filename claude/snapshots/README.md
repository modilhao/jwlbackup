# `claude/snapshots/` — Linha-de-partida dos exportadores

Esta pasta guarda *snapshots* determinísticos do output dos exportadores (Markdown antigo + Vault Obsidian novo) gerados a partir do mesmo `userData.db` de referência. Não são logs nem releases: são âncoras de regressão pra acompanhar a refatoração V2 (ver `claude/ESTUDO - Arquitetura Obsidian Export.md` §10).

## Estrutura

```
claude/snapshots/
├── README.md                          ← este arquivo
└── 0001-baseline/                     ← versão pré-Fase 1
    ├── METADATA.md                    ← sumário, notas escolhidas, instruções
    ├── vault-novo/                    ← obsidian/exporter.ts
    │   ├── _index.txt                 ← lista ordenada de TODOS os paths gerados
    │   ├── sample-nota-biblia.md
    │   ├── sample-nota-publicacao.md
    │   ├── sample-versiculo-atomico.md
    │   ├── sample-moc.md
    │   └── sample-espiritual-home.md
    └── markdown-antigo/               ← markdown.ts (exportador antigo)
        ├── _index.txt
        ├── sample-nota-biblia.md
        └── sample-nota-publicacao.md
```

Quando uma Fase futura mudar o schema, criar uma nova pasta versionada (ex: `0002-fase1-schema/`) com o mesmo layout e diff lado-a-lado pelo git/`diff`.

## Por que existem

A Fase 1 do V2 (alinhar schema com a SPEC e a AMOSTRA) vai mexer em frontmatter, folders, naming, tags. **Sem âncora de regressão, é fácil quebrar coisas que ninguém percebe** — uma nota perde uma chave do frontmatter, um MOC perde um wikilink, o atomic verse muda de nome e quebra link do vault de outro usuário.

Os snapshots tornam o diff explícito: `git diff claude/snapshots/0001-baseline 0002-fase1-schema` mostra exatamente o que mudou.

## Como gerar

Pré-requisito: o backup pessoal do Marcel já está extraído em `claude/jwlibrary_extract/userData.db` (gitignore — nunca commitar).

```bash
bun install            # uma vez, garante node_modules
bun run prepare        # uma vez, gera .svelte-kit/tsconfig.json
bun run snapshot       # gera/regenera claude/snapshots/0001-baseline/
```

O script é determinístico: mesma entrada → mesma saída. Se rodar duas vezes no mesmo backup, `git diff` deve aparecer vazio.

## Critério de regressão

Após cada Fase, regerar o snapshot e classificar cada diff:

| Tipo de diff | Veredito |
|---|---|
| Mudança esperada pelo plano da Fase (ex: Fase 1 remove `/{ano}/`) | ✓ Aceitável — esperado |
| Mudança não-esperada que melhora qualidade | ✓ Documentar nas notas da Fase |
| Mudança que desfaz convenção da SPEC/AMOSTRA | ✗ **Bloqueia merge** — corrigir antes |
| Quebra de wikilink ou perda de campo de frontmatter sem substituto | ✗ **Bloqueia merge** — corrigir antes |
| Path do `_index.txt` muda mas conteúdo dos samples é igual | ⚠ Investigar (talvez ordem alfabética só) |

## Notas escolhidas para sample (determinístico)

O script seleciona por `NoteId` derivado da ordem `LastModified DESC`:
- **Sample bíblica:** primeira nota com `BlockType=2` e `KeySymbol` bíblico (nwtsty/nwt/...)
- **Sample publicação:** primeira nota com `KeySymbol` não-bíblico

A escolha por `NoteId` (e não por path) garante que mesmo que a estrutura de pastas mude entre Fases, o sample acompanha a *mesma nota original*, permitindo comparar frontmatter e conteúdo lado-a-lado.

## Privacidade

⚠ Os arquivos `sample-*.md` contêm **conteúdo pessoal real** do Marcel (reflexões em notas, tags pessoais).

**Decisão tomada (02/05/2026):** Marcel optou por commitar o baseline com dados reais enquanto o repo permanece privado. **Antes de tornar o repo público**, executar uma das ações:

1. Substituir o source `userData.db` por um backup *sintético* (notas inventadas) e regerar `bun run snapshot`, OU
2. Remover `claude/snapshots/` da história do git via `git filter-repo` ou similar antes do primeiro push público

`claude/jwlibrary_extract/` segue no `.gitignore` em qualquer cenário — só os snapshots derivados (samples) carregam o risco.
