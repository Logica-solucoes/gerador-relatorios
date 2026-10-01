# BASF BI Mercado — laboratório

Dashboard web que substitui o Power BI "Dashboard BI Mercado" do portal BASF. Mesmo padrão do
`web/momentive/`: vira componente Aurelia no portal (fase 2). Spec:
`docs/superpowers/specs/2026-10-01-basf-bi-mercado-design.md`.

```bash
bun run dash:basf:snapshot   # .pbix + banco Basf → web/basf/dados/ (precisa de _intake/basf e SQL local)
bun run dash:basf            # bundle do preview
bun run dash:basf:serve      # http://localhost:4173
bun test web/basf
```

`dados/` não vai para o git: tem nome de cliente. `dados/pendencias.json` lista o que o snapshot
não conseguiu resolver (município sem código IBGE, grafia não mapeada) — leia depois de cada snapshot.

`src/shared/` é cópia do LogicaDash (`18c26a5`), retematizada (`bfmd` → `bmd`, paleta em
`tema.ts`, ícones Tabler em `icones.ts`). Na fase 2 o `shared/` do portal Basf nasce daqui.
