# Snapshot 0001 — baseline pré-Fase 1

Gerado em: 2026-05-06T11:48:40.708Z
Source DB: `claude/jwlibrary_extract/userData.db`

## Sumário do vault novo (`obsidian/exporter.ts`)

- Notas pessoais: **3223**
- Versículos atômicos: **3637**
- MOCs por etiqueta: **28**
- Total de arquivos: **6890**

## Sumário do markdown antigo (`markdown.ts`)

- Total de notas: **3223**
- Estrutura: `Notas/<arquivo>.md` + `_Índice.md`

## Notas representativas escolhidas

| Tipo | NoteId | Referência | Critério |
|---|---|---|---|
| Bíblica | 3323 | Isaías 57:17 | Primeira (LastModified DESC) com BlockType=2 e KeySymbol bíblico |
| Publicação | 3317 | w.26.02 doc 2026282 par. 16 | Primeira (LastModified DESC) com KeySymbol não-bíblico |

## Como recomparar após uma Fase

```bash
bun run snapshot                        # gera novo output
git diff claude/snapshots/0001-baseline # ve o diff
```

Detalhes: ver `claude/snapshots/README.md` para o protocolo.
