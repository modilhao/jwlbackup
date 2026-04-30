<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

# JWLBackup

**Gerencie seus backups do JW Library direto no navegador.**
Privado · local · open source.

</div>

---

JWLBackup é um app web que abre, edita e organiza arquivos `.jwlibrary` (backups gerados pelo
JW Library) — sem servidor, sem upload, sem rastreamento. Tudo acontece no seu navegador.

> **Status**: v0.1 (alpha) — visualização de notas, marcações, favoritos, etiquetas, playlists,
> localizações; edição de notas; manutenção (limpar órfãos, VACUUM); empacotamento e download
> do `.jwlibrary` modificado com hash recalculado.

## Recursos

- Abrir arquivos `.jwlibrary` (drag & drop ou seletor)
- Navegar todas as tabelas: Notas, Marcações, Favoritos, Etiquetas, Playlists, Localizações,
  Mídia
- Editar e excluir notas
- Limpar registros órfãos
- Compactar banco (VACUUM)
- Salvar de volta como `.jwlibrary` válido (manifest + hash recomputados)

## Roadmap

- v0.2: editor de marcações, playlists, mídia; exportar XLSX/Markdown/JSON
- v0.3: importar / mesclar backups
- v0.4: build desktop (Tauri) com sistema de arquivos nativo

## Desenvolvimento

```bash
bun install
bun run dev
```

Abra http://localhost:5173.

## Stack

- SvelteKit 2 + Svelte 5 (runes)
- TypeScript
- Tailwind CSS 4
- sql.js (SQLite WASM)
- fflate (ZIP)

## Licença

GPL-3.0 — veja [LICENSE](LICENSE).

## Aviso

Este projeto não é afiliado à Watch Tower Bible and Tract Society. *JW Library* é marca
registrada de seus respectivos donos. Sempre mantenha um backup do seu arquivo original
antes de fazer alterações.
