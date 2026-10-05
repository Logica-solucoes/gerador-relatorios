# BASF BI Mercado — laboratório

Dashboard web que substitui o Power BI "Dashboard BI Mercado" do portal BASF. Mesmo padrão do
`web/momentive/`: vira componente Aurelia no portal (fase 2). Spec:
`docs/superpowers/specs/2026-10-01-basf-bi-mercado-design.md`.

```bash
bun run dash:basf:snapshot   # .pbix + banco Basf → web/basf/dados/ (precisa de _intake/basf e SQL local)
bun run dash:basf            # bundle do preview
bun run dash:basf:sales      # bundle do preview do Sales (http://localhost:4173/sales.html)
bun run dash:basf:serve      # http://localhost:4173
bun test web/basf
```

`dados/` não vai para o git: tem nome de cliente. `dados/pendencias.json` lista o que o snapshot
não conseguiu resolver (município sem código IBGE, grafia não mapeada) — leia depois de cada snapshot.

`src/shared/` é cópia do LogicaDash (`18c26a5`), retematizada (`bfmd` → `bmd`, paleta em
`tema.ts`, ícones Tabler em `icones.ts`). Na fase 2 o `shared/` do portal Basf nasce daqui.

## Decisões que não são óbvias

- **Regra de venda** (BASF, 05/10/2026): a do PBI Sales, data da nota e só `order_type` SBB e SDB, sem descontar devolução. TH = `inv_qty`. Difere do relatório PDF (`clients/basf`), que usa BR, sem DUMMY e líquido. WMR fica nas vendas.
- **IBGE: os níveis BR, UF, ME e MU não somam entre si.** Total usa BR (UF com estado filtrado); pontos do mapa usam MU. O mesmo município aparece uma vez por espécie, de propósito. O `Cód.` do PBI não é confiável como código IBGE: em MU o `cod` é resolvido por nome + UF contra `municipios`, e o que não casa vai para `pendencias.json`.
- **CEPEA:** o item é seleção única, padrão "Área Cepea" como no PBI. Entram o "Consolidado" e a "Estimativa agosto/24", que se complementam por produto (2023 mistura as duas, 2024 só tem a estimativa). Só hectare: "Mi. Planta" fica fora. Linha só de região cai quando o mesmo produto/ano/estimativa vem por estado.
- **ABCSEM:** a aba Mercado mostra todas as espécies e o segmento bruto (Híbrido, OP...), como o PBI; Comparativo e a âncora de conferência usam só as espécies BASF.
- **BASF no Comparativo:** área de semeio direto (2020: 122.060 ha, confirmado pela BASF), recalculada da tabela do estudo. O resumo do PBI soma o transplantio (125.428).
- **Vendas:** o corte do YTD é automático (dia da última venda no ano corrente, como o PBI; 12 em ano fechado) ou um mês escolhido no seletor (`corte` no hash).
- **Sales** (`sales.html`, spec `2026-10-02-basf-sales-design.md`): mesmo `montarDashboard` com o painel `SALES`. Lê o mesmo `vendas` do BI Mercado; o RTV já vem com a carteira do PBI Sales (BR10→BR02 em 3 clientes no WMW, BR04/BR07 com o nome, junto com os demais. As 3 abas compartilham filtros.
