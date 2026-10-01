# BASF BI Mercado — laboratório visual (fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard web `web/basf/` com 4 abas (Mercado, Comparativo, Clientes-chave, Vendas) substituindo o Power BI "Dashboard BI Mercado", rodando sobre snapshot local.

**Architecture:** Padrão `web/momentive/`: `montarDashboard(host, carregar)` em DOM puro + Observable Plot, CSS escopado `.bmd`. Snapshot em duas etapas: Python (`pbixray`) só extrai tabelas cruas do `.pbix`; Bun (`snapshot/montar.ts`) normaliza, casa municípios e grava `dados/*.json`. Lógica pura (`calc.ts`, `estado.ts`, `geo.ts`, `snapshot/normaliza.ts`) testada com `bun test`; UI verificada por screenshot.

**Tech Stack:** Bun, TypeScript strict, `@observablehq/plot` 0.6.17, `d3-array`, `mssql` (já no repo), Python via `uv` + `pbixray`.

**Spec:** `docs/superpowers/specs/2026-10-01-basf-bi-mercado-design.md` — leia antes de começar.

---

## Contexto que o executor precisa

- Insumos do cliente estão em `_intake/basf/arquivos basf/` (ignorado pelo git). O `.pbix` de mercado: `_intake/basf/arquivos basf/Dashboard Mercado BASF - BANCO.pbix`. Taxa do euro está no `forecast.pbix` da mesma pasta.
- Banco local: `clients/basf/.env` aponta para `Basf-Relatorio`. **O banco do portal é `Basf`** (mesmo servidor, mesmas credenciais). Os scripts deste plano usam `DB_NAME=Basf` explicitamente.
- `shared/` vem do LogicaDash, commit fixo `18c26a5` em `C:\Users\floppydisk\Documents\Trabalho\Logica-ChatBot\LogicaDash`, pasta `LogicaDashFront/src/bfm/dashboards/shared/`. Copie com `git show`, nunca faça checkout lá.
- Regras de vendas: `clients/basf/CLAUDE.md` (DUMMY, `ship_to_country='BR'`, `inv_date`, `cust_name`).
- Armadilhas do Plot: `CLAUDE.md` da raiz, seção `## Plot` (`dx`/`dy` são constantes; `tickFormat` recebe `(v, i)`).
- **IBGE tem níveis que não somam entre si**: 2024 → BR 232.102 ha, UF 232.102, MU 326.067. Total usa BR (ou UF quando há filtro de estado); ranking por estado usa UF; mesorregião usa ME; pontos do mapa usam MU. Nunca some MU para total.
- Vendas no PBI: `ONS`/`ONI` viram `ONX`; `WMR` é excluído. Repetir isso no snapshot.

## Mapa de arquivos

```
web/basf/
  README.md
  index.html                 shell do preview
  servir.ts                  Bun.serve estático (fetch não funciona em file://)
  snapshot/
    extrair_pbix.py          .pbix → dados/_bruto/*.json (sem lógica)
    normaliza.ts             limparHotspot, dividirUF, casarMunicipio, normalizarCrop (puro)
    normaliza.test.ts
    montar.ts                _bruto → dados/*.json + dados/pendencias.json
    vendas.ts                SQL Basf → dados/_bruto/vendas.json
    malha.ts                 API IBGE → src/geo/uf.json (anéis corrigidos)
    conferir.ts              reconciliação com o PBI
    meta_anual.json          budget/forecast/taxa por ano
  dados/                     (git-ignored)
  src/
    types.ts                 contrato
    fontes.ts                dimensões e métricas por fonte + nível IBGE
    calc.ts / calc.test.ts
    estado.ts / estado.test.ts
    geo.ts / geo.test.ts
    geo/uf.json
    carregar.ts              fetch + expandir (preview)
    dashboard.ts             montarDashboard
    componentes.ts           seg, chips, kpi, barList, distribuicao, skeleton, erro
    mapa.ts
    abas/mercado.ts, comparativo.ts, clientes.ts, vendas.ts
    shared/                  formato.ts, blocos.ts, shell.ts, drill.ts, filtros.ts, tema.ts, icones.ts, estilo.css
    dashboard.css
    preview.ts
```

## Ordem e paralelismo

- **Lote 1:** Task 1.
- **Lote 2 (paralelo):** Task 2, Task 5.
- **Lote 3 (paralelo):** Task 3, Task 4, Task 6, Task 7, Task 8.
- **Lote 4:** Task 9 (precisa de 6, 7, 8).
- **Lote 5:** Task 10, depois Task 11.
- **Lote 6 (paralelo):** Tasks 12, 13, 14, 15 — arquivos distintos.
- **Lote 7:** Task 16.

---

### Task 1: Scaffold, shared retematizado e scripts

**Files:**
- Create: `web/basf/README.md`, `web/basf/index.html`, `web/basf/servir.ts`, `web/basf/src/preview.ts` (provisório), `web/basf/src/shared/*`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Copiar o shared do LogicaDash**

```bash
cd /c/Users/floppydisk/Documents/Trabalho/Gerador-Relatorios
mkdir -p web/basf/src/shared web/basf/src/abas web/basf/src/geo web/basf/snapshot
for f in formato.ts blocos.ts shell.ts drill.ts filtros.ts estilo.css; do
  git -C ../Logica-ChatBot/LogicaDash show 18c26a5:LogicaDashFront/src/bfm/dashboards/shared/$f > web/basf/src/shared/$f
done
sed -i 's/bfmd/bmd/g' web/basf/src/shared/*
sed -i "s#@import url('https://fonts.googleapis.com/css2?family=Geist[^']*');#@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800\&family=JetBrains+Mono:wght@500\&display=swap');#" web/basf/src/shared/estilo.css
grep -n "@import" web/basf/src/shared/estilo.css
```
Expected: a linha do `@import` aponta para Manrope + JetBrains Mono.

- [ ] **Step 2: Substituir `tema.ts` (paleta BASF/Nunhems)**

Create `web/basf/src/shared/tema.ts`:

```ts
/**
 * Paleta e constantes visuais do dashboard BASF BI Mercado.
 * Fonte ÚNICA de cor de série: o Plot pinta inline a partir daqui.
 * Laranja é a marca do portal; verde é a segunda série (hortaliça);
 * azul BASF só na marca; vermelho só alerta. Ver `## UI stack` no CLAUDE.md.
 */
export const C = {
  o50: "#FFF8ED", o100: "#FFEFD4", o200: "#FFDBA8", o300: "#F7B04A",
  o500: "#F39500", o600: "#E07B00", o700: "#B95D02",
  verde: "#4F8A2A", verde300: "#A9CF8A",
  azulBasf: "#004A96",
  alerta: "#C60023",
  ink: "#24180B", muted: "#7D6B57", border: "#ECE2D3", surface: "#FFFFFF",
  anterior: "#CDBBA3",
} as const;

/** Cor de cada fonte no Comparativo. */
export const COR_FONTE: Record<string, string> = {
  BASF: C.o500, ABCSEM: C.verde, IBGE: C.azulBasf, CEPEA: "#9B7B5B",
};

/** Escala para composição (barra 100%) e choropleth. */
export const ESCALA = [C.o500, C.o300, C.o200, C.verde, C.verde300, "#D9CBB6"];

export const LARGURA_COMPACTA = 640;

/** Ver comentário original no LogicaDash (shared/tema.ts): raio grande e finito. */
export const RAIO_PONTEIRO_BANDA = 10_000;

export const ESTILO_PLOT = {
  style: {
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
    fontSize: "12px",
    background: "transparent",
    color: C.muted,
  },
} as const;

const MIN_ESPACO_TICK = 26;

export function ticksEixoX(dominio: string[], largura: number): string[] | undefined {
  const maxVisiveis = Math.max(1, Math.floor(largura / MIN_ESPACO_TICK));
  const passo = Math.max(1, Math.ceil(dominio.length / maxVisiveis));
  return passo > 1 ? dominio.filter((_, i) => i % passo === 0) : undefined;
}
```

- [ ] **Step 3: Ícones Tabler inline e troca do Material Icons**

Create `web/basf/src/shared/icones.ts`:

```ts
/** Tabler outline, traço 2, só os glifos usados. Um set, um peso (UI stack). */
const svg = (d: string) =>
  `<svg class="bmd-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONE = {
  voltar: svg('<path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>'),
  fechar: svg('<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>'),
  mais: svg('<path d="M12 5l0 14"/><path d="M5 12l14 0"/>'),
  abrir: svg('<path d="M9 6l6 6l-6 6"/>'),
  aberto: svg('<path d="M6 9l6 6l6 -6"/>'),
  repetir: svg('<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>'),
} as const;
```

Em `web/basf/src/shared/drill.ts`:
- adicione `import { ICONE } from "./icones";` abaixo do import de `./formato`;
- troque `<i class="material-icons" aria-hidden="true">arrow_back</i>` por `${ICONE.voltar}`.

Em `web/basf/src/shared/filtros.ts`, apague tudo a partir da linha que começa com `/* ── data ──` até o fim do arquivo (`data`, `Acao`, `Barra`, `barra` não são usados aqui), e apague a função `multiSelect` inteira e a constante `MAX_DESCRICAO`. O que fica: `Controle`, `FiltroDescrito`, `novoId`, `envelope`, `normalizar`, `busca`. Remova `dia` do import de `./formato` (fica `import { esc } from "./formato";`).

Em `web/basf/src/shared/estilo.css`, apague o bloco `.bmd .material-icons { font-family: 'Material Icons'; }` e seu comentário.

- [ ] **Step 4: Scripts no package.json**

Adicione em `scripts` de `package.json`:

```json
"dash:basf": "bun build web/basf/src/preview.ts --outdir web/basf/dist --target browser --minify",
"dash:basf:serve": "bun run web/basf/servir.ts",
"dash:basf:snapshot": "uv run --no-project --with pbixray python web/basf/snapshot/extrair_pbix.py && bun --env-file=clients/basf/.env run web/basf/snapshot/vendas.ts && bun run web/basf/snapshot/montar.ts && bun run web/basf/snapshot/conferir.ts"
```

- [ ] **Step 5: index.html, servir.ts, preview provisório**

Create `web/basf/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BASF | Nunhems · Inteligência de Mercado</title>
<link rel="stylesheet" href="src/shared/estilo.css">
<link rel="stylesheet" href="src/dashboard.css">
<style>body { margin: 0; background: #FBF7F1; }</style>
</head>
<body>
  <div id="app"></div>
  <script src="dist/preview.js"></script>
</body>
</html>
```

Create `web/basf/servir.ts`:

```ts
/** Preview local: o dashboard faz fetch de dados/*.json, e fetch não roda em file://. */
const RAIZ = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

Bun.serve({
  port: 4173,
  async fetch(req) {
    const caminho = decodeURIComponent(new URL(req.url).pathname);
    const arquivo = Bun.file(RAIZ + (caminho === "/" ? "index.html" : caminho.slice(1)));
    return (await arquivo.exists()) ? new Response(arquivo) : new Response("404", { status: 404 });
  },
});
console.log("http://localhost:4173");
```

Create `web/basf/src/dashboard.css` (vazio por enquanto, só o comentário):

```css
/* Tokens e componentes do BI Mercado. Carregado DEPOIS de shared/estilo.css. */
```

Create `web/basf/src/preview.ts` (provisório, substituído na Task 10):

```ts
document.getElementById("app")!.textContent = "BI Mercado — scaffold";
```

- [ ] **Step 6: README**

Create `web/basf/README.md`:

````markdown
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
````

- [ ] **Step 7: Verificar build e tipos**

```bash
bun run dash:basf && bunx tsc --noEmit -p .
```
Expected: bundle gerado em `web/basf/dist/preview.js`, `tsc` sem erros.

- [ ] **Step 8: Commit**

```bash
git add web/basf package.json
git commit -m "feat(basf-dash): scaffold do bi mercado com shared retematizado"
```

---

### Task 2: Contrato de dados e definição das fontes

**Files:**
- Create: `web/basf/src/types.ts`, `web/basf/src/fontes.ts`

- [ ] **Step 1: types.ts**

```ts
/**
 * Contrato de dados do BI Mercado. Interface entre o snapshot (lab) / API (portal) e a tela.
 * Mudou coluna na origem? Muda aqui primeiro.
 *
 * Regra: o dashboard filtra e soma. Não recalcula regra de negócio — de-paras, hotspot,
 * segmento, crop, potencial e regional chegam prontos.
 */
export type Fonte = "basf" | "ibge" | "abcsem" | "cepea";
export type Aba = "mercado" | "comparativo" | "clientes" | "vendas";
export type Valor = string | number | null;
export type Linha = Record<string, Valor>;

/** Formato no fio: nomes de coluna uma vez, linhas em array. Corta ~60% do JSON do IBGE. */
export interface TabelaFio { c: string[]; r: Valor[][] }

export type Recurso = Fonte | "resumo" | "resumoSeg" | "clientes" | "vendas" | "meta" | "municipios";
export type Carregar = (r: Recurso) => Promise<Linha[]>;

/*
 * Colunas por recurso (todas presentes em toda linha; ausência = null):
 *
 * basf       ano, uf, cod, municipio, hotspot, regional, rtv, crop, cropDesc, segmento, hy,
 *            area, dose, th, potencial, potencialEur
 * ibge       nivel ("BR"|"UF"|"ME"|"MU"), ano, especie, uf, meso, cod, nome, area
 * abcsem     ano, especie, tipo, segmento, crop, selecionado (0|1), area, volume, valor
 * cepea      ano, safra, regiao, uf, estado, regional, produto, item, valor
 * resumo     fonte, ano, especie, area, th                       (Dados Mercado Total)
 * resumoSeg  fonte, ano, especie, segmento, hy, crop, area, th   (Dados Basf e ABCSEM)
 * clientes   cliente, crop, hotspot, rtv, regional, acesso, ano, area, dose, mercado, copa,
 *            enxertia, vendasEnx, mercadoCopaEnx, potencial, vendasPotencial
 * vendas     ano, mes, crop, rtv, regional, cliente, hotspot, segmento, valor, th
 * meta       ano, budget, forecast, taxa, ultimaVenda (ISO; só na linha do maior ano)
 * municipios cod, nome, uf, lat, lon
 */
```

- [ ] **Step 2: fontes.ts**

```ts
import type { Fonte, Linha } from "./types";

export interface DefFonte {
  rotulo: string;
  /** dimensão → rótulo do chip. Ordem = ordem na barra. */
  dims: Record<string, string>;
  /** métrica → rótulo. A primeira é a padrão. */
  metricas: Record<string, string>;
  /** Dimensões do ranking (bar-list), na ordem dos botões. */
  rankings: string[];
  temMapa: boolean;
}

export const FONTES: Record<Fonte, DefFonte> = {
  basf: {
    rotulo: "BASF",
    dims: { ano: "Ano", regional: "Regional", crop: "Crop", hotspot: "Hotspot", segmento: "Segmento", rtv: "RTV", uf: "Estado" },
    metricas: { area: "Área (ha)", dose: "Dose TH/ha", th: "Total TH" },
    rankings: ["uf", "hotspot", "regional", "crop"],
    temMapa: true,
  },
  ibge: {
    rotulo: "IBGE",
    dims: { ano: "Ano", especie: "Espécie", uf: "Estado" },
    metricas: { area: "Área (ha)" },
    rankings: ["uf", "meso"],
    temMapa: true,
  },
  abcsem: {
    rotulo: "ABCSEM",
    dims: { ano: "Ano", especie: "Espécie", tipo: "Tipo", segmento: "Segmento" },
    metricas: { volume: "Volume (M ou kg)", area: "Área (ha)", valor: "Valor (R$)" },
    rankings: ["especie", "tipo", "segmento"],
    temMapa: false,
  },
  cepea: {
    rotulo: "CEPEA",
    dims: { ano: "Ano", produto: "Produto", item: "Item", regiao: "Região", uf: "Estado", regional: "Regional" },
    metricas: { valor: "Valor" },
    rankings: ["regiao", "uf", "regional"],
    temMapa: true,
  },
};

export const ROTULO_DIM: Record<string, string> = {
  uf: "Estado", hotspot: "Hotspot", regional: "Regional", crop: "Crop", meso: "Mesorregião",
  especie: "Espécie", tipo: "Tipo", segmento: "Segmento", regiao: "Região", rtv: "RTV",
};

/**
 * IBGE: os níveis NÃO somam entre si (2024: BR 232.102 ha, MU 326.067 ha).
 * Cada visão lê o nível certo. Nunca some município para total.
 */
export type Visao = "total" | "uf" | "meso" | "mapa";
const NIVEL: Record<Visao, string> = { total: "BR", uf: "UF", meso: "ME", mapa: "MU" };

export function linhasIbge(ls: Linha[], visao: Visao, temFiltroUf: boolean): Linha[] {
  // Com estado filtrado o nível BR não tem `uf` para casar: o total vem dos UFs.
  const nivel = visao === "total" && temFiltroUf ? "UF" : NIVEL[visao];
  return ls.filter((l) => l.nivel === nivel);
}
```

- [ ] **Step 3: Tipos compilam**

Run: `bunx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add web/basf/src/types.ts web/basf/src/fontes.ts
git commit -m "feat(basf-dash): contrato de dados e definicao das fontes"
```

---

### Task 3: calc.ts — agregação e razões (seams 1 e 2)

**Files:**
- Create: `web/basf/src/calc.ts`, `web/basf/src/calc.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { agregar, atingimento, filtrar, share, total, variacao } from "./calc";

const L = [
  { uf: "MG", crop: "ONX", ano: 2024, area: 100, dose: 10 },
  { uf: "MG", crop: "WMW", ano: 2024, area: 50, dose: 30 },
  { uf: "SP", crop: "ONX", ano: 2024, area: 80, dose: 20 },
  { uf: "SP", crop: "CUP", ano: 2024, area: 0, dose: null },
  { uf: null, crop: "ONX", ano: 2023, area: 999, dose: 5 },
];

describe("filtrar/total", () => {
  test("filtro vazio passa tudo; valores comparados como texto", () => {
    expect(filtrar(L, { ano: [] }).length).toBe(5);
    expect(filtrar(L, { ano: ["2024"] }).length).toBe(4);
  });
  test("soma ignora null; dose é média", () => {
    expect(total(filtrar(L, { ano: ["2024"] }), "area")).toBe(230);
    expect(total(filtrar(L, { ano: ["2024"] }), "dose")).toBe(20);
  });
  test("sem valor numérico devolve null, não 0", () => {
    expect(total([{ area: null }], "area")).toBeNull();
    expect(total([], "area")).toBeNull();
  });
});

describe("agregar", () => {
  test("agrupa, ordena desc, respeita filtros", () => {
    expect(agregar(L, { ano: ["2024"] }, "uf", "area")).toEqual([
      { chave: "MG", valor: 150 },
      { chave: "SP", valor: 80 },
    ]);
  });
  test("chave nula fica fora; grupo com valor 0 some do ranking", () => {
    const r = agregar(L, {}, "crop", "area").map((g) => g.chave);
    expect(r).not.toContain("CUP");
    expect(agregar(L, {}, "uf", "area").map((g) => g.chave)).toEqual(["MG", "SP"]);
  });
});

describe("razões", () => {
  test("share: null sem denominador", () => {
    expect(share(18, 100)).toBeCloseTo(0.18);
    expect(share(18, 0)).toBeNull();
    expect(share(18, null)).toBeNull();
    expect(share(null, 100)).toBeNull();
  });
  test("variacao: null sem base ou base abaixo do mínimo", () => {
    expect(variacao(110, 100)).toBeCloseTo(0.1);
    expect(variacao(110, 0)).toBeNull();
    expect(variacao(110, null)).toBeNull();
    expect(variacao(5000, 900, 1000)).toBeNull();
    expect(variacao(-50, -100)).toBeNull();
  });
  test("atingimento é realizado / meta", () => {
    expect(atingimento(29, 94)).toBeCloseTo(0.3085, 3);
    expect(atingimento(29, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test web/basf/src/calc.test.ts`
Expected: FAIL — `Cannot find module './calc'`.

- [ ] **Step 3: Implementação**

```ts
import type { Linha } from "./types";

/** dimensão → valores aceitos. Lista vazia = sem filtro. */
export type Filtros = Record<string, string[]>;

export function passa(l: Linha, f: Filtros): boolean {
  for (const [dim, vals] of Object.entries(f)) {
    if (vals.length && !vals.includes(String(l[dim] ?? ""))) return false;
  }
  return true;
}

export const filtrar = (ls: Linha[], f: Filtros) => ls.filter((l) => passa(l, f));

/** Métricas que são média e não soma (o DAX do PBI usa AVERAGE para dose). */
const MEDIA = new Set(["dose"]);

export function total(ls: Linha[], metrica: string): number | null {
  let soma = 0, n = 0;
  for (const l of ls) {
    const v = l[metrica];
    if (typeof v === "number" && Number.isFinite(v)) { soma += v; n++; }
  }
  if (!n) return null;
  return MEDIA.has(metrica) ? soma / n : soma;
}

export interface Grupo { chave: string; valor: number }

export function agregar(ls: Linha[], f: Filtros, dim: string, metrica: string): Grupo[] {
  const grupos = new Map<string, Linha[]>();
  for (const l of ls) {
    if (!passa(l, f)) continue;
    const k = l[dim];
    if (k == null || k === "") continue;
    const chave = String(k);
    const g = grupos.get(chave);
    if (g) g.push(l); else grupos.set(chave, [l]);
  }
  return [...grupos]
    .map(([chave, xs]) => ({ chave, valor: total(xs, metrica) ?? 0 }))
    .filter((g) => g.valor !== 0)
    .sort((a, b) => b.valor - a.valor);
}

type N = number | null | undefined;
const ok = (v: N): v is number => typeof v === "number" && Number.isFinite(v);

export function share(parte: N, todo: N): number | null {
  return ok(parte) && ok(todo) && todo !== 0 ? parte / todo : null;
}

/** Base mínima: "+262%" sobre R$ 800 não é informação. Base negativa (devolução) não tem leitura. */
export function variacao(atual: N, anterior: N, baseMinima = 0): number | null {
  if (!ok(atual) || !ok(anterior) || anterior <= 0 || anterior < baseMinima) return null;
  return atual / anterior - 1;
}

export const atingimento = share;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test web/basf/src/calc.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add web/basf/src/calc.ts web/basf/src/calc.test.ts
git commit -m "feat(basf-dash): agregacao e razoes com travessao sem denominador"
```

---

### Task 4: estado.ts — estado único, filtros e hash (seams 3 e 4)

**Files:**
- Create: `web/basf/src/estado.ts`, `web/basf/src/estado.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { alternarFiltro, deHash, definirFiltro, inicial, paraHash, trocarFonte } from "./estado";

describe("trocarFonte", () => {
  test("descarta filtro que a fonte nova não tem e avisa", () => {
    let e = inicial();
    e = definirFiltro(e, "rtv", ["Wenio Barbosa"]);
    e = definirFiltro(e, "uf", ["MG"]);
    const { estado, descartados } = trocarFonte(e, "ibge");
    expect(estado.fonte).toBe("ibge");
    expect(estado.filtros.mercado.rtv).toBeUndefined();
    expect(estado.filtros.mercado.uf).toEqual(["MG"]);
    expect(descartados).toEqual(["RTV"]);
  });
  test("métrica inexistente na fonte nova volta para a padrão", () => {
    let e = { ...inicial(), metrica: "dose" };
    expect(trocarFonte(e, "abcsem").estado.metrica).toBe("volume");
    e = { ...inicial(), metrica: "area" };
    expect(trocarFonte(e, "ibge").estado.metrica).toBe("area");
  });
});

describe("filtros", () => {
  test("ano é compartilhado entre mercado e comparativo", () => {
    const e = definirFiltro(inicial(), "ano", ["2024"]);
    expect(e.filtros.comparativo.ano).toEqual(["2024"]);
    expect(e.filtros.clientes.ano).toBeUndefined();
  });
  test("alternar: clicar de novo remove", () => {
    let e = alternarFiltro(inicial(), "uf", "MG");
    expect(e.filtros.mercado.uf).toEqual(["MG"]);
    e = alternarFiltro(e, "uf", "MG");
    expect(e.filtros.mercado.uf).toBeUndefined();
  });
  test("não muta o estado de entrada", () => {
    const a = inicial();
    definirFiltro(a, "uf", ["SP"]);
    expect(a.filtros.mercado.uf).toBeUndefined();
  });
});

describe("hash", () => {
  test("ida e volta sem perda", () => {
    let e = inicial();
    e = { ...e, aba: "mercado", metrica: "th", agrupar: "rtv", dim: "hotspot" };
    e = trocarFonte(e, "basf").estado;
    e = definirFiltro(e, "uf", ["MG", "São Paulo, SP"]);
    e = definirFiltro(e, "ano", ["2024"]);
    const volta = deHash(paraHash(e));
    expect(volta.aba).toBe("mercado");
    expect(volta.fonte).toBe("basf");
    expect(volta.metrica).toBe("th");
    expect(volta.agrupar).toBe("rtv");
    expect(volta.dim).toBe("hotspot");
    expect(volta.filtros.mercado).toEqual({ uf: ["MG", "São Paulo, SP"], ano: ["2024"] });
    expect(volta.filtros.comparativo.ano).toEqual(["2024"]);
  });
  test("hash vazio ou lixo cai no inicial", () => {
    expect(deHash("")).toEqual(inicial());
    expect(deHash("#xyz?fonte=nada").aba).toBe("mercado");
    expect(deHash("#xyz?fonte=nada").fonte).toBe("basf");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test web/basf/src/estado.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementação**

```ts
import type { Filtros } from "./calc";
import { FONTES } from "./fontes";
import type { Aba, Fonte } from "./types";

export interface Estado {
  aba: Aba;
  fonte: Fonte;
  filtros: Record<Aba, Filtros>;
  metrica: string;
  moeda: "brl" | "eur";
  medida: "valor" | "th";
  agrupar: "hotspot" | "rtv" | "crop";
  /** Dimensão ativa do ranking da aba Mercado. */
  dim: string;
  /** Caminho do drill do ranking (fora do hash: é navegação, não visão). */
  drill: string[];
  /** Cliente com a ficha aberta (fora do hash). */
  clienteAberto: string | null;
}

const ABAS: Aba[] = ["mercado", "comparativo", "clientes", "vendas"];
const COMPARTILHA_ANO: Aba[] = ["mercado", "comparativo"];

export function inicial(): Estado {
  return {
    aba: "mercado", fonte: "basf",
    filtros: { mercado: {}, comparativo: {}, clientes: {}, vendas: {} },
    metrica: "area", moeda: "brl", medida: "valor", agrupar: "hotspot", dim: "uf",
    drill: [], clienteAberto: null,
  };
}

const copiar = (e: Estado): Estado => ({
  ...e,
  filtros: Object.fromEntries(ABAS.map((a) => [a, { ...e.filtros[a] }])) as Record<Aba, Filtros>,
  drill: [...e.drill],
});

export function definirFiltro(e: Estado, dim: string, valores: string[]): Estado {
  const n = copiar(e);
  const alvos = dim === "ano" && COMPARTILHA_ANO.includes(e.aba) ? COMPARTILHA_ANO : [e.aba];
  for (const a of alvos) {
    if (valores.length) n.filtros[a][dim] = [...valores];
    else delete n.filtros[a][dim];
  }
  return n;
}

export function alternarFiltro(e: Estado, dim: string, valor: string): Estado {
  const atual = e.filtros[e.aba][dim] ?? [];
  return definirFiltro(e, dim, atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor]);
}

export function trocarFonte(e: Estado, fonte: Fonte): { estado: Estado; descartados: string[] } {
  const def = FONTES[fonte];
  const n = copiar(e);
  n.fonte = fonte;
  n.drill = [];
  const descartados: string[] = [];
  for (const dim of Object.keys(n.filtros.mercado)) {
    if (!(dim in def.dims)) {
      descartados.push(FONTES[e.fonte].dims[dim] ?? dim);
      delete n.filtros.mercado[dim];
    }
  }
  if (!(n.metrica in def.metricas)) n.metrica = Object.keys(def.metricas)[0]!;
  if (!def.rankings.includes(n.dim)) n.dim = def.rankings[0]!;
  return { estado: n, descartados };
}

export function paraHash(e: Estado): string {
  const p = new URLSearchParams();
  p.set("fonte", e.fonte);
  p.set("m", e.metrica);
  p.set("moeda", e.moeda);
  p.set("medida", e.medida);
  p.set("agrupar", e.agrupar);
  p.set("dim", e.dim);
  for (const [dim, vals] of Object.entries(e.filtros[e.aba])) for (const v of vals) p.append(`f.${dim}`, v);
  return `#${e.aba}?${p}`;
}

export function deHash(hash: string): Estado {
  const e = inicial();
  const [abaTxt = "", query = ""] = hash.replace(/^#/, "").split("?");
  if (!ABAS.includes(abaTxt as Aba)) return e;
  e.aba = abaTxt as Aba;
  const p = new URLSearchParams(query);
  const fonte = p.get("fonte");
  let n = fonte && fonte in FONTES ? trocarFonte(e, fonte as Fonte).estado : e;
  n.metrica = p.get("m") ?? n.metrica;
  n.moeda = p.get("moeda") === "eur" ? "eur" : "brl";
  n.medida = p.get("medida") === "th" ? "th" : "valor";
  const ag = p.get("agrupar");
  if (ag === "hotspot" || ag === "rtv" || ag === "crop") n.agrupar = ag;
  n.dim = p.get("dim") ?? n.dim;
  const dims = new Set([...p.keys()].filter((k) => k.startsWith("f.")));
  for (const k of dims) n = definirFiltro(n, k.slice(2), p.getAll(k));
  return n;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test web/basf/src/estado.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/basf/src/estado.ts web/basf/src/estado.test.ts
git commit -m "feat(basf-dash): estado unico com filtros por aba e hash"
```

---

### Task 5: geo.ts — orientação dos anéis e malha das UFs (seam 6)

**Files:**
- Create: `web/basf/src/geo.ts`, `web/basf/src/geo.test.ts`, `web/basf/snapshot/malha.ts`, `web/basf/src/geo/uf.json` (gerado)

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { corrigirAneis, horario } from "./geo";

// Quadrado com furo, ambos anti-horários (como a API do IBGE entrega, RFC 7946).
const fora = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const furo = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
const fc = () => ({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [structuredClone(fora), structuredClone(furo)] } },
    { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: [[structuredClone(fora)]] } },
  ],
});

describe("corrigirAneis", () => {
  test("exterior fica horário e furo anti-horário (o que o d3 espera)", () => {
    const r = corrigirAneis(fc());
    const [ext, buraco] = r.features[0]!.geometry.coordinates as number[][][];
    expect(horario(ext!)).toBe(true);
    expect(horario(buraco!)).toBe(false);
    const multi = r.features[1]!.geometry.coordinates as number[][][][];
    expect(horario(multi[0]![0]!)).toBe(true);
  });
  test("idempotente: aplicar duas vezes não desfaz", () => {
    const r = corrigirAneis(corrigirAneis(fc()));
    expect(horario(r.features[0]!.geometry.coordinates[0] as number[][])).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test web/basf/src/geo.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementação**

```ts
/**
 * A malha do IBGE vem com exteriores anti-horários (RFC 7946). O d3-geo, usado pelo Plot,
 * lê anti-horário como "o globo menos este polígono" e pinta um quadrado cheio no mapa.
 * Aqui orientamos pelo sinal da área: exterior horário, furo anti-horário. Idempotente.
 */
type Anel = number[][];
interface Geometria { type: string; coordinates: unknown }
interface Feicao { type: string; properties: Record<string, unknown>; geometry: Geometria }
export interface Colecao { type: string; features: Feicao[] }

/** Horário em lon/lat (y para cima): soma de (x2−x1)(y2+y1) positiva. */
export function horario(anel: Anel): boolean {
  let s = 0;
  for (let i = 0; i < anel.length - 1; i++) {
    const [x1, y1] = anel[i]!, [x2, y2] = anel[i + 1]!;
    s += (x2! - x1!) * (y2! + y1!);
  }
  return s > 0;
}

function orientar(poligono: Anel[]): void {
  poligono.forEach((anel, i) => {
    const querHorario = i === 0;
    if (horario(anel) !== querHorario) anel.reverse();
  });
}

export function corrigirAneis<T extends Colecao>(fc: T): T {
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === "Polygon") orientar(g.coordinates as Anel[]);
    else if (g.type === "MultiPolygon") (g.coordinates as Anel[][]).forEach(orientar);
  }
  return fc;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test web/basf/src/geo.test.ts`
Expected: PASS.

- [ ] **Step 5: Script da malha**

Create `web/basf/snapshot/malha.ts`:

```ts
/** Baixa a malha de UFs do IBGE, corrige os anéis e grava `src/geo/uf.json` (versionado).
 *  Roda uma vez; a malha de estados não muda. `properties.uf` = sigla. */
import { corrigirAneis, type Colecao } from "../src/geo";

const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const URL_MALHA = "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF";
const URL_UFS = "https://servicodados.ibge.gov.br/api/v1/localidades/estados";

const malha = (await (await fetch(URL_MALHA)).json()) as Colecao;
const ufs = (await (await fetch(URL_UFS)).json()) as { id: number; sigla: string }[];
const sigla = new Map(ufs.map((u) => [String(u.id), u.sigla]));
for (const f of malha.features) f.properties = { uf: sigla.get(String(f.properties.codarea)) };
if (malha.features.length !== 27 || malha.features.some((f) => !f.properties.uf)) {
  throw new Error(`malha inesperada: ${malha.features.length} feições`);
}
await Bun.write(`${AQUI}../src/geo/uf.json`, JSON.stringify(corrigirAneis(malha)));
console.log("uf.json: 27 UFs");
```

Run: `bun run web/basf/snapshot/malha.ts`
Expected: `uf.json: 27 UFs`; arquivo `web/basf/src/geo/uf.json` ~95 kB.

- [ ] **Step 6: Commit**

```bash
git add web/basf/src/geo.ts web/basf/src/geo.test.ts web/basf/snapshot/malha.ts web/basf/src/geo/uf.json
git commit -m "feat(basf-dash): malha ibge de ufs com aneis orientados para o d3"
```

---

### Task 6: Extração crua do .pbix (Python)

**Files:**
- Create: `web/basf/snapshot/extrair_pbix.py`

Só extrai. Nenhuma regra aqui: renomear coluna e filtrar o que o próprio PBI filtra na página.

- [ ] **Step 1: Script**

```python
"""Extrai as tabelas já transformadas do .pbix para web/basf/dados/_bruto/*.json.

Sem regra de negócio: a normalização mora em montar.ts (testada). Aqui só se escolhe
tabela, renomeia coluna e aplica o filtro que a PRÓPRIA página do PBI aplica.
"""
from pathlib import Path
from pbixray import PBIXRay

RAIZ = Path(__file__).resolve().parents[3]
INTAKE = RAIZ / "_intake" / "basf" / "arquivos basf"
SAIDA = RAIZ / "web" / "basf" / "dados" / "_bruto"
SAIDA.mkdir(parents=True, exist_ok=True)

m = PBIXRay(str(INTAKE / "Dashboard Mercado BASF - BANCO.pbix"))
f = PBIXRay(str(INTAKE / "forecast.pbix"))


def gravar(nome, df, colunas):
    df = df[list(colunas)].rename(columns=colunas)
    df.to_json(SAIDA / f"{nome}.json", orient="records", force_ascii=False)
    print(f"{nome}: {len(df)}")


gravar("basf", m.get_table("BASF"), {
    "Ano Estudo": "ano", "Estado": "uf", "cidade_mapa": "municipio", "hotspot_dexpara": "hotspot",
    "Regional": "regional", "Sales Specialist": "rtv", "Crop": "crop", "Crop_descricao": "cropDesc",
    "segmento_dexpara": "segmento", "op/hy/f2_dexpara": "hy",
    "Área Semeio Direto (HA)": "area", "DOSE (TH/HA)_Semeio Direto": "dose", "TOTAL TH": "th",
    "Potencial R$": "potencial", "Potencial euro": "potencialEur",
})

ibge = m.get_table("IBGE")
A = "Área plantada ou destinada à colheita (Hectares)"
# Página IBGE do PBI exclui Espécie = "Total". GR e MI ficam de fora: nenhuma visão usa.
ibge = ibge[(ibge["Espécie"] != "Total") & ibge["Nível"].isin(["BR", "UF", "ME", "MU"]) & (ibge[A] > 0)]
gravar("ibge", ibge, {"Nível": "nivel", "Ano": "ano", "Espécie": "especie", "estado_v2": "uf",
                      "Cód.": "cod", "Descrição": "nome", A: "area"})

gravar("abcsem", m.get_table("ABCSEM"), {
    "Ano": "ano", "Espécie": "especie", "Tipo": "tipo", "segmento_dexpara": "segmento", "CROP": "crop",
    "produtos_selecionados": "selecionado",
    "Área Total Estimada do Mercado de Sementes (ha)": "area",
    "Volume Total Estimado do Mercado (M ou Kg) TH": "volume",
    "Valor Total Estimado do Mercado de Sementes (R$)": "valor",
})

cepea = m.get_table("CEPEA")
# Filtros da página CEPEA: Estimativa = Consolidado; Região ≠ Brasil e não nula.
cepea = cepea[(cepea["Estimativa"] == "Consolidado") & cepea["Região"].notna() & (cepea["Região"] != "Brasil")]
gravar("cepea", cepea, {"Ano Civil": "ano", "Ano Safra": "safra", "Região": "regiao", "Estado": "estado",
                        "Regional": "regional", "Produto": "produto", "Itens Projeção": "item", "Valor": "valor"})

gravar("resumo", m.get_table("Dados Mercado Total"),
       {"Fonte": "fonte", "Ano": "ano", "Espécie": "especie", "Área total": "area", "Total TH": "th"})
gravar("resumoSeg", m.get_table("Dados Basf e ABCSEM"), {
    "Fonte": "fonte", "Ano": "ano", "Espécie": "especie", "segmento_dexpara": "segmento",
    "hy/op/f2_dexpara": "hy", "CROP": "crop", "Área total": "area", "Total TH": "th"})

gravar("clientes", m.get_table("Key Customer List"), {
    "Customer": "cliente", "Crop": "crop", "hotspot_dexpara": "hotspot", "Sales Specialist": "rtv",
    "Regional": "regional", "Acesso": "acesso", "Ano": "ano", "Área (HA)": "area", "Dose TH (HA)": "dose",
    "TOTAL TH": "mercado", "Vendas de COPA (TH)": "copa", "Enxertia (TH)": "enxertia",
    "Vendas de ENXERTIA (TH)": "vendasEnx", "TOTAL TH (COPA + ENXERTIA)": "mercadoCopaEnx",
    "Potencial R$": "potencial", "vendas pontencial basf R$": "vendasPotencial"})

gravar("municipios", m.get_table("Municípios e Coord# Sedes 2013"),
       {"GEOCODIGO_MUNICIPIO": "cod", "NOME_MUNICIPIO": "nome", "LATITUDE": "lat", "LONGITUDE": "lon"})

gravar("depara_cliente_hotspot", m.get_table("dexpara Cliente - Hotspot"),
       {"CUST_NO": "custNo", "CROP": "crop", "hotspot_dexpara": "hotspot"})
gravar("depara_item_segmento", m.get_table("de x para Produtos x segmento"),
       {"item_desc": "item", "Segmento II": "segmentoII"})
gravar("depara_segmento", m.get_table("de x para segmento"),
       {"Segmento II": "segmentoII", "dexpara segmento": "segmento"})
gravar("sales_specialist", m.get_table("Sales Specialist"),
       {"PRIMARY_CONTACT": "cod", "SALESPERSON_NAME": "nome", "Regional": "regional"})
gravar("taxa", f.get_table("Budget Rate"), {"Ano": "ano", "Rate": "taxa"})
```

- [ ] **Step 2: Rodar**

Run: `uv run --no-project --with pbixray python web/basf/snapshot/extrair_pbix.py`
Expected: uma linha por tabela; `basf: 4200`, `clientes: 431`, `taxa: 5`, `ibge` entre 40 e 80 mil. Se `de x para segmento` não tiver as colunas `Segmento II` / `dexpara segmento`, rode `PBIXRay(...).get_table("de x para segmento").columns` e ajuste o mapeamento (é a única tabela cujo cabeçalho não foi conferido no planejamento).

- [ ] **Step 3: Commit**

```bash
git add web/basf/snapshot/extrair_pbix.py
git commit -m "feat(basf-dash): extracao crua das tabelas do pbix"
```

---

### Task 7: Normalização do snapshot (seam 5)

**Files:**
- Create: `web/basf/snapshot/normaliza.ts`, `web/basf/snapshot/normaliza.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { casarMunicipio, dividirUF, indiceMunicipios, limparHotspot, normalizarCrop } from "./normaliza";

describe("limparHotspot", () => {
  test("unifica grafias conhecidas", () => {
    expect(limparHotspot("MONTEALTO")).toBe("Monte Alto");
    expect(limparHotspot("MONTE ALTO")).toBe("Monte Alto");
    expect(limparHotspot("SÃO JOSE DO RIO PARDO")).toBe("São José do Rio Pardo");
    expect(limparHotspot("SAO JOSE RIO PARDO")).toBe("São José do Rio Pardo");
    expect(limparHotspot("Sta Cruz do Rio Pardo")).toBe("Santa Cruz do Rio Pardo");
    expect(limparHotspot("Chapada dos VEadeiros")).toBe("Chapada dos Veadeiros");
  });
  test("tira sufixos de sazonalidade e UF", () => {
    expect(limparHotspot("Bauru - Safra")).toBe("Bauru");
    expect(limparHotspot("Goianápolis - GO")).toBe("Goianápolis");
    expect(limparHotspot("Santarém, Pará")).toBe("Santarém");
  });
  test("caixa alta vira título; nulo fica nulo", () => {
    expect(limparHotspot("CAXIAS DO SUL")).toBe("Caxias do Sul");
    expect(limparHotspot("Irecê")).toBe("Irecê");
    expect(limparHotspot(null)).toBeNull();
    expect(limparHotspot("  ")).toBeNull();
  });
});

describe("dividirUF", () => {
  test("separa estados compostos; 0 e vazio viram lista vazia", () => {
    expect(dividirUF("BA/PE")).toEqual(["BA", "PE"]);
    expect(dividirUF("DF/GO")).toEqual(["DF", "GO"]);
    expect(dividirUF("MG")).toEqual(["MG"]);
    expect(dividirUF("0")).toEqual([]);
    expect(dividirUF(null)).toEqual([]);
  });
});

describe("normalizarCrop", () => {
  test("cebola tem um código só, como no PBI; WMR sai", () => {
    expect(normalizarCrop("ONS")).toBe("ONX");
    expect(normalizarCrop("ONI")).toBe("ONX");
    expect(normalizarCrop("WMW")).toBe("WMW");
    expect(normalizarCrop("WMR")).toBeNull();
    expect(normalizarCrop(null)).toBe("Sem crop");
  });
});

describe("casarMunicipio", () => {
  const idx = indiceMunicipios([
    { cod: 3170107, nome: "UBERABA", uf: "MG" },
    { cod: 2910800, nome: "IRECÊ", uf: "BA" },
    { cod: 1100015, nome: "SANTA LUZIA", uf: "RO" },
    { cod: 3157807, nome: "SANTA LUZIA", uf: "MG" },
  ]);
  test("casa sem acento e sem caixa, pela UF", () => {
    expect(casarMunicipio("Irece", ["BA"], idx)).toBe(2910800);
    expect(casarMunicipio("Uberaba", ["MG"], idx)).toBe(3170107);
  });
  test("homônimo resolve pela UF; UF composta tenta cada uma", () => {
    expect(casarMunicipio("Santa Luzia", ["MG"], idx)).toBe(3157807);
    expect(casarMunicipio("Santa Luzia", ["BA", "MG"], idx)).toBe(3157807);
  });
  test("sem UF ou sem casamento devolve null, nunca chuta", () => {
    expect(casarMunicipio("Santa Luzia", [], idx)).toBeNull();
    expect(casarMunicipio("Atlântida", ["MG"], idx)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test web/basf/snapshot/normaliza.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementação**

```ts
/** Limpeza do snapshot. Tudo explícito: o que não casa vai para pendencias.json, não some. */

const chave = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** Grafias vistas nos dados (key list e BASF consolidado). Chave sem acento, caixa alta. */
const GRAFIAS: Record<string, string> = {
  "MONTEALTO": "Monte Alto",
  "MONTE ALTO": "Monte Alto",
  "SAO JOSE DO RIO PARDO": "São José do Rio Pardo",
  "SAO JOSE RIO PARDO": "São José do Rio Pardo",
  "STA CRUZ DO RIO PARDO": "Santa Cruz do Rio Pardo",
  "CHAPADA DOS VEADEIROS": "Chapada dos Veadeiros",
  "PATOS DE MINAS": "Patos de Minas",
  "MARILANDIA DO SUL": "Marilândia do Sul",
  "MOGI GUACU": "Mogi Guaçu",
  "CARMOPOLIS DE MINAS": "Carmópolis de Minas",
  "CATALAO": "Catalão",
};

const MINUSCULAS = new Set(["de", "do", "da", "dos", "das", "e"]);
const titulo = (s: string) =>
  s.toLowerCase().split(" ").map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");

export function limparHotspot(s: string | null | undefined): string | null {
  if (s == null) return null;
  let t = s.trim().replace(/\s+/g, " ");
  if (!t) return null;
  t = t.replace(/\s*-\s*Safra$/i, "").replace(/\s*-\s*[A-Z]{2}$/, "").replace(/,\s*Par[aá]$/i, "");
  const g = GRAFIAS[chave(t)];
  if (g) return g;
  return t === t.toUpperCase() ? titulo(t) : t;
}

export function dividirUF(s: string | null | undefined): string[] {
  if (!s || s === "0") return [];
  return s.split("/").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
}

/** Igual ao Power Query do PBI: ONS/ONI → ONX, WMR fora. */
export function normalizarCrop(kind: string | null | undefined): string | null {
  if (!kind) return "Sem crop";
  if (kind === "WMR") return null;
  return kind === "ONS" || kind === "ONI" ? "ONX" : kind;
}

export type IndiceMunicipios = Map<string, number>;

export function indiceMunicipios(ms: { cod: number; nome: string; uf: string }[]): IndiceMunicipios {
  return new Map(ms.map((m) => [`${m.uf}|${chave(m.nome)}`, m.cod]));
}

export function casarMunicipio(nome: string | null, ufs: string[], idx: IndiceMunicipios): number | null {
  if (!nome) return null;
  for (const uf of ufs) {
    const cod = idx.get(`${uf}|${chave(nome)}`);
    if (cod != null) return cod;
  }
  return null;
}

/** UF a partir do código IBGE do município (2 primeiros dígitos). */
const UF_POR_COD: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};
export const ufDoCodigo = (cod: number) => UF_POR_COD[String(cod).slice(0, 2)] ?? null;

/** CEPEA usa nome de estado por extenso, às vezes composto ("GO/DF"). */
const UF_POR_NOME: Record<string, string> = {
  "ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAZONAS": "AM", "BAHIA": "BA", "CEARA": "CE",
  "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", "GOIAS": "GO", "MARANHAO": "MA", "MATO GROSSO": "MT",
  "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", "PARA": "PA", "PARAIBA": "PB", "PARANA": "PR",
  "PERNAMBUCO": "PE", "PIAUI": "PI", "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN",
  "RIO GRANDE DO SUL": "RS", "RONDONIA": "RO", "RORAIMA": "RR", "SANTA CATARINA": "SC",
  "SAO PAULO": "SP", "SERGIPE": "SE", "TOCANTINS": "TO",
};
export function ufsDoEstado(s: string | null | undefined): string[] {
  if (!s) return [];
  const k = chave(s);
  if (UF_POR_NOME[k]) return [UF_POR_NOME[k]!];
  return dividirUF(s);
}
```

Adicione ao teste (mesmo arquivo) e rode de novo:

```ts
import { ufDoCodigo, ufsDoEstado } from "./normaliza";
test("uf por código e por nome", () => {
  expect(ufDoCodigo(3170107)).toBe("MG");
  expect(ufsDoEstado("Minas Gerais")).toEqual(["MG"]);
  expect(ufsDoEstado("GO/DF")).toEqual(["GO", "DF"]);
  expect(ufsDoEstado("Triângulo")).toEqual([]);
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test web/basf/snapshot/normaliza.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/basf/snapshot/normaliza.ts web/basf/snapshot/normaliza.test.ts
git commit -m "feat(basf-dash): normalizacao de hotspot, uf, crop e municipio do snapshot"
```

---

### Task 8: Vendas do banco e meta anual

**Files:**
- Create: `web/basf/snapshot/vendas.ts`, `web/basf/snapshot/meta_anual.json`

- [ ] **Step 1: meta_anual.json**

Budget/forecast reais só existem para 2024 (digitados no PBI). Taxa vem do `forecast.pbix`. Ano sem meta fica `null` — a tela mostra "meta não cadastrada".

```json
[
  { "ano": 2022, "budget": null, "forecast": null, "taxa": 6.44 },
  { "ano": 2023, "budget": null, "forecast": null, "taxa": 5.3 },
  { "ano": 2024, "budget": 46051500, "forecast": 57365000, "taxa": 5.5 },
  { "ano": 2025, "budget": null, "forecast": null, "taxa": 5.775 },
  { "ano": 2026, "budget": null, "forecast": null, "taxa": 5.775 }
]
```

- [ ] **Step 2: vendas.ts**

```ts
/**
 * Vendas do banco do portal (`Basf`) → dados/_bruto/vendas.json.
 * Regras de clients/basf/CLAUDE.md: data da nota, sem DUMMY, só BR, líquido com devoluções.
 * Uso: bun --env-file=clients/basf/.env run web/basf/snapshot/vendas.ts
 * DB_NAME do .env é Basf-Relatorio; aqui forçamos o banco do portal.
 */
import sql from "mssql";

const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`${n} não definida`); return v; };

const pool = await sql.connect({
  server: req("DB_HOST"), user: req("DB_USER"), password: req("DB_PASS"), database: "Basf",
  options: { encrypt: true, trustServerCertificate: process.env.DB_TRUST_CERT === "true" },
  requestTimeout: 120000,
});

const linhas = (await pool.request().query(`
  SELECT YEAR(v.inv_date) ano, MONTH(v.inv_date) mes, v.kind, v.primary_contact rtvCod,
         f.nome rtvNome, v.cust_no custNo, v.cust_name cliente, v.item_desc item,
         SUM(v.total_line_amt) valor, SUM(v.inv_qty_th) th
  FROM basf_vendas v LEFT JOIN basf_fte f ON f.cod = v.primary_contact
  WHERE v.cust_name NOT LIKE '%DUMMY%' AND v.ship_to_country = 'BR' AND v.inv_date IS NOT NULL
  GROUP BY YEAR(v.inv_date), MONTH(v.inv_date), v.kind, v.primary_contact, f.nome,
           v.cust_no, v.cust_name, v.item_desc`)).recordset;

const [{ ultima }] = (await pool.request().query(`
  SELECT CONVERT(varchar(10), MAX(inv_date), 23) ultima FROM basf_vendas
  WHERE cust_name NOT LIKE '%DUMMY%' AND ship_to_country = 'BR'`)).recordset;

await pool.close();
await Bun.write(`${AQUI}../dados/_bruto/vendas.json`, JSON.stringify({ ultimaVenda: ultima, linhas }));
console.log(`vendas: ${linhas.length} linhas, última venda ${ultima}`);
```

- [ ] **Step 3: Rodar**

Run: `bun --env-file=clients/basf/.env run web/basf/snapshot/vendas.ts`
Expected: `vendas: N linhas, última venda 2026-06-30` (N na casa de milhares).

- [ ] **Step 4: Commit**

```bash
git add web/basf/snapshot/vendas.ts web/basf/snapshot/meta_anual.json
git commit -m "feat(basf-dash): snapshot de vendas do banco e meta anual"
```

---

### Task 9: Montagem do snapshot e reconciliação

**Files:**
- Create: `web/basf/snapshot/montar.ts`, `web/basf/snapshot/conferir.ts`

- [ ] **Step 1: montar.ts**

```ts
/**
 * _bruto/*.json → dados/<recurso>.json no formato TabelaFio, + dados/pendencias.json.
 * Toda regra de limpeza vem de normaliza.ts (testado). Aqui é só encanamento.
 */
import type { Linha, TabelaFio, Valor } from "../src/types";
import {
  casarMunicipio, dividirUF, indiceMunicipios, limparHotspot, normalizarCrop, ufDoCodigo, ufsDoEstado,
} from "./normaliza";

const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const BRUTO = `${AQUI}../dados/_bruto/`;
const SAIDA = `${AQUI}../dados/`;
type Bruto = Record<string, any>;
const ler = async (n: string): Promise<Bruto[]> => Bun.file(`${BRUTO}${n}.json`).json();
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (v == null || String(v).trim() === "" ? null : String(v).trim());

const pendencias: Record<string, string[]> = {};
const pendente = (tipo: string, v: string) => { (pendencias[tipo] ??= []).includes(v) || pendencias[tipo]!.push(v); };

async function gravar(nome: string, linhas: Linha[]) {
  const c = Object.keys(linhas[0] ?? {});
  const fio: TabelaFio = { c, r: linhas.map((l) => c.map((k) => l[k] as Valor)) };
  await Bun.write(`${SAIDA}${nome}.json`, JSON.stringify(fio));
  console.log(`${nome}: ${linhas.length}`);
}

// municípios: uf derivada do código
const munBruto = await ler("municipios");
const municipios = munBruto.map((m) => ({ cod: m.cod as number, nome: String(m.nome), uf: ufDoCodigo(m.cod)!, lat: num(m.lat), lon: num(m.lon) }));
const idx = indiceMunicipios(municipios);
await gravar("municipios", municipios);

// BASF consolidado
await gravar("basf", (await ler("basf")).map((b) => {
  const ufs = dividirUF(b.uf);
  const municipio = txt(b.municipio);
  const cod = casarMunicipio(municipio, ufs, idx);
  if (municipio && cod == null) pendente("municipio_sem_codigo", `${municipio} (${b.uf ?? "sem UF"})`);
  return {
    ano: num(b.ano), uf: ufs.length === 1 ? ufs[0]! : (cod != null ? ufDoCodigo(cod) : txt(b.uf)),
    cod, municipio, hotspot: limparHotspot(b.hotspot), regional: txt(b.regional), rtv: txt(b.rtv),
    crop: txt(b.crop), cropDesc: txt(b.cropDesc), segmento: txt(b.segmento), hy: txt(b.hy),
    area: num(b.area), dose: num(b.dose), th: num(b.th), potencial: num(b.potencial), potencialEur: num(b.potencialEur),
  };
}));

// IBGE: meso só faz sentido no nível ME; cod de MU vira uf pelo código
await gravar("ibge", (await ler("ibge")).map((i) => ({
  nivel: i.nivel, ano: num(i.ano), especie: txt(i.especie),
  uf: txt(i.uf) ?? (i.nivel === "MU" ? ufDoCodigo(i.cod) : null),
  meso: i.nivel === "ME" ? txt(i.nome) : null,
  cod: i.nivel === "MU" ? num(i.cod) : null, nome: txt(i.nome), area: num(i.area),
})));

await gravar("abcsem", (await ler("abcsem")).map((a) => ({
  ano: num(a.ano), especie: txt(a.especie), tipo: txt(a.tipo), segmento: txt(a.segmento), crop: txt(a.crop),
  selecionado: a.selecionado ? 1 : 0, area: num(a.area), volume: num(a.volume), valor: num(a.valor),
})));

await gravar("cepea", (await ler("cepea")).map((c) => {
  const ufs = ufsDoEstado(c.estado);
  return {
    ano: num(c.ano), safra: txt(c.safra), regiao: txt(c.regiao), uf: ufs.length === 1 ? ufs[0]! : null,
    estado: txt(c.estado), regional: txt(c.regional), produto: txt(c.produto), item: txt(c.item), valor: num(c.valor),
  };
}));

await gravar("resumo", (await ler("resumo")).map((r) => ({
  fonte: r.fonte, ano: num(r.ano), especie: txt(r.especie), area: num(r.area), th: num(r.th),
})));
await gravar("resumoSeg", (await ler("resumoSeg")).map((r) => ({
  fonte: r.fonte, ano: num(r.ano), especie: txt(r.especie), segmento: txt(r.segmento), hy: txt(r.hy),
  crop: txt(r.crop), area: num(r.area), th: num(r.th),
})));

await gravar("clientes", (await ler("clientes")).map((k) => ({
  cliente: txt(k.cliente), crop: txt(k.crop), hotspot: limparHotspot(k.hotspot), rtv: txt(k.rtv),
  regional: txt(k.regional), acesso: txt(k.acesso), ano: num(k.ano), area: num(k.area), dose: num(k.dose),
  mercado: num(k.mercado), copa: num(k.copa), enxertia: num(k.enxertia), vendasEnx: num(k.vendasEnx),
  mercadoCopaEnx: num(k.mercadoCopaEnx), potencial: num(k.potencial), vendasPotencial: num(k.vendasPotencial),
})));

// Vendas: enriquecidas com os mesmos de-paras do PBI
const hotspotPor = new Map((await ler("depara_cliente_hotspot")).map((d) => [`${d.custNo}|${d.crop}`, limparHotspot(d.hotspot)]));
const seg2 = new Map((await ler("depara_item_segmento")).map((d) => [String(d.item), String(d.segmentoII)]));
const segFinal = new Map((await ler("depara_segmento")).map((d) => [String(d.segmentoII), String(d.segmento)]));
const regionalPor = new Map((await ler("sales_specialist")).map((s) => [String(s.cod), txt(s.regional)]));
const vendasBruto = (await Bun.file(`${BRUTO}vendas.json`).json()) as { ultimaVenda: string; linhas: Bruto[] };

const vendas = new Map<string, Linha>();
for (const v of vendasBruto.linhas) {
  const crop = normalizarCrop(v.kind);
  if (crop == null) continue;
  const s2 = seg2.get(String(v.item));
  const l: Linha = {
    ano: v.ano, mes: v.mes, crop, rtv: txt(v.rtvNome) ?? txt(v.rtvCod) ?? "Sem RTV",
    regional: regionalPor.get(String(v.rtvCod)) ?? "Sem regional", cliente: txt(v.cliente),
    hotspot: hotspotPor.get(`${v.custNo}|${crop}`) ?? null,
    segmento: s2 ? segFinal.get(s2) ?? s2 : null, valor: 0, th: 0,
  };
  const k = [l.ano, l.mes, l.crop, l.rtv, l.regional, l.cliente, l.hotspot, l.segmento].join("|");
  const acc = vendas.get(k) ?? vendas.set(k, l).get(k)!;
  acc.valor = (acc.valor as number) + (num(v.valor) ?? 0);
  acc.th = (acc.th as number) + (num(v.th) ?? 0);
}
await gravar("vendas", [...vendas.values()]);

const meta = (await Bun.file(`${AQUI}meta_anual.json`).json()) as Linha[];
const maior = Math.max(...meta.map((m) => m.ano as number));
await gravar("meta", meta.map((m) => ({ ...m, ultimaVenda: m.ano === maior ? vendasBruto.ultimaVenda : null })));

await Bun.write(`${SAIDA}pendencias.json`, JSON.stringify(pendencias, null, 2));
console.log("pendências:", Object.fromEntries(Object.entries(pendencias).map(([k, v]) => [k, v.length])));
```

Run: `bun run web/basf/snapshot/montar.ts`
Expected: uma linha por recurso; `pendências: { municipio_sem_codigo: N }` com N pequeno (o protótipo casou 52 de 70 só por nome, sem UF; com UF deve casar mais). Abra `web/basf/dados/pendencias.json` e copie a lista para o relatório final da task.

- [ ] **Step 2: conferir.ts**

```ts
/** Reconciliação com o Power BI. Falhou âncora → exit 1 (o snapshot não está pronto). */
import { filtrar, share, total } from "../src/calc";
import { linhasIbge } from "../src/fontes";
import type { Linha, TabelaFio } from "../src/types";

const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ler = async (n: string): Promise<Linha[]> => {
  const t = (await Bun.file(`${AQUI}../dados/${n}.json`).json()) as TabelaFio;
  return t.r.map((r) => Object.fromEntries(t.c.map((c, i) => [c, r[i] ?? null])));
};

const basf24 = filtrar(await ler("basf"), { ano: ["2024"] });
const resumo = await ler("resumo");
const ibge = linhasIbge(filtrar(await ler("ibge"), { ano: ["2024"] }), "total", false);
const kcl = await ler("clientes");
const vendas = await ler("vendas");
const v26 = vendas.filter((v) => v.ano === 2026 && (v.mes as number) <= 6);

const ancoras: [string, number | null, number, number][] = [
  ["BASF 2024 área semeio", total(basf24, "area"), 111587, 1],
  ["BASF 2024 Total TH", total(basf24, "th"), 34348416, 1],
  ["BASF 2024 potencial R$", total(basf24, "potencial"), 342609894, 1000],
  ["ABCSEM 2024 área (resumo)", total(filtrar(resumo, { fonte: ["ABCSEM"], ano: ["2024"] }), "area"), 397125, 1],
  ["IBGE 2024 área BR", total(ibge, "area"), 232102, 1],
  ["Key list share copa", share(total(kcl, "copa"), total(kcl, "mercado")), 0.18949, 0.0005],
  ["Vendas YTD jan-jun 2026 R$", total(v26, "valor"), 29022009.43, 1],
];

let falhou = false;
for (const [nome, obtido, esperado, tol] of ancoras) {
  const ok = obtido != null && Math.abs(obtido - esperado) <= tol;
  falhou ||= !ok;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}: ${obtido} (esperado ${esperado})`);
}

// Informativo, não bloqueia: share potencial do PBI (17,9%) usa vendas por data de pedido,
// com DUMMY e export. A decisão sobre a divergência é do usuário (spec §4).
const potencial = total(basf24, "potencial");
const vendas24 = total(vendas.filter((v) => v.ano === 2024), "valor");
console.log(`info  share potencial 2024 com as regras do snapshot: ${((share(vendas24, potencial) ?? 0) * 100).toFixed(1)}% (PBI: 17,9%)`);

if (falhou) process.exit(1);
```

Run: `bun run web/basf/snapshot/conferir.ts`
Expected: todas as linhas `ok`, mais a linha `info` com o share (~20,8%). Se uma âncora falhar, investigue a extração (Task 6) ou a montagem — não ajuste o número esperado.

- [ ] **Step 3: Rodar o pipeline completo**

Run: `bun run dash:basf:snapshot`
Expected: termina com exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/basf/snapshot/montar.ts web/basf/snapshot/conferir.ts
git commit -m "feat(basf-dash): montagem do snapshot e reconciliacao com o pbi"
```

---

### Task 10: Casca do dashboard — carga, abas, barra, estados de espera e erro

**Files:**
- Create: `web/basf/src/carregar.ts`, `web/basf/src/componentes.ts`, `web/basf/src/dashboard.ts`, `web/basf/src/abas/tipos.ts`
- Modify: `web/basf/src/preview.ts`, `web/basf/src/dashboard.css`

- [ ] **Step 1: carregar.ts**

```ts
import type { Carregar, Linha, TabelaFio } from "./types";

export function expandir(t: TabelaFio): Linha[] {
  return t.r.map((r) => Object.fromEntries(t.c.map((c, i) => [c, r[i] ?? null])));
}

/** Preview: lê do snapshot. No portal (fase 2) troca por RequestHelper → endpoint. */
export const carregarArquivo = (base: string): Carregar => async (r) => {
  const resp = await fetch(`${base}${r}.json`);
  if (!resp.ok) throw new Error(`${r}: HTTP ${resp.status}`);
  return expandir((await resp.json()) as TabelaFio);
};
```

- [ ] **Step 2: contrato das abas**

Create `web/basf/src/abas/tipos.ts`:

```ts
import type { Shell } from "../shared/shell";
import type { Estado } from "../estado";
import type { Aba, Linha, Recurso } from "../types";

export type Dados = Partial<Record<Recurso, Linha[]>>;

export interface Ctx {
  shell: Shell;
  estado: Estado;
  dados: Dados;
  /** Aplica uma transformação ao estado e redesenha. */
  mudar(f: (e: Estado) => Estado): void;
}

export interface DefAba {
  id: Aba;
  rotulo: string;
  recursos(e: Estado): Recurso[];
  /** Dimensões dos chips desta aba (dim → rótulo), e de onde tirar as opções. */
  chips(e: Estado): { dims: Record<string, string>; origem: Recurso };
  /** Controles à direita da barra (segmentados), em HTML. */
  controles(e: Estado): string;
  render(ctx: Ctx, corpo: HTMLElement): void;
}
```

- [ ] **Step 3: componentes.ts**

```ts
import { esc, nf } from "./shared/formato";
import { ICONE } from "./shared/icones";
import { C } from "./shared/tema";
import type { Grupo } from "./calc";

/** Controle segmentado. Clique delegado em `[data-seg]` no dashboard. */
export function seg(nome: string, opcoes: Record<string, string>, atual: string, desabilitar: string[] = [], dica = ""): string {
  return `<div class="bmd-seg2" role="group">${Object.entries(opcoes).map(([v, r]) => {
    const off = desabilitar.includes(v);
    return `<button type="button" data-seg="${nome}" data-v="${esc(v)}"${v === atual ? ' class="is-on" aria-pressed="true"' : ""}${off ? ` disabled title="${esc(dica)}"` : ""}>${esc(r)}</button>`;
  }).join("")}</div>`;
}

/** Chips da barra: ativo mostra valor e ×; inativo é "+ Dim" e abre a lista de opções. */
export function chips(dims: Record<string, string>, ativos: Record<string, string[]>, opcoes: (dim: string) => string[]): string {
  return Object.entries(dims).map(([dim, rot]) => {
    const vals = ativos[dim] ?? [];
    const lista = opcoes(dim).map((o) =>
      `<label><input type="checkbox" data-chip-op="${dim}" value="${esc(o)}"${vals.includes(o) ? " checked" : ""}> <span>${esc(o)}</span></label>`).join("");
    const resumo = vals.length === 0 ? `${ICONE.mais}${esc(rot)}` : `${esc(rot)}: ${esc(vals.length === 1 ? vals[0]! : `${vals.length} selecionados`)}`;
    const limpar = vals.length ? `<button type="button" class="bmd-chip-x" data-chip-limpar="${dim}" aria-label="Remover ${esc(rot)}">${ICONE.fechar}</button>` : "";
    return `<span class="bmd-chipf${vals.length ? " is-on" : ""}"><details class="bmd-ms"><summary>${resumo}</summary><div class="bmd-ms__lista">${lista || '<div class="bmd-sug__nota">Sem opções neste recorte</div>'}</div></details>${limpar}</span>`;
  }).join("");
}

export interface Kpi {
  rotulo: string;
  valor: string;
  /** Texto exato quando `valor` vem abreviado. */
  exato?: string;
  delta?: { txt: string; ruim: boolean } | null;
  nota?: string;
  serie?: (number | null)[];
  destaque?: boolean;
  /** 0–1: desenha a tick bar (share, atingimento). */
  proporcao?: number | null;
  /** 0–1: marcador de ritmo esperado sobre a tick bar. */
  marcador?: number | null;
}

function sparkline(serie: (number | null)[]): string {
  const vs = serie.map((v) => (v == null ? null : v));
  const nums = vs.filter((v): v is number => v != null);
  if (nums.length < 2) return "";
  const lo = Math.min(...nums), hi = Math.max(...nums);
  const y = (v: number) => (hi === lo ? 14 : 26 - ((v - lo) / (hi - lo)) * 24);
  const x = (i: number) => (i / (vs.length - 1)) * 100;
  // Buraco na série quebra a linha (BASF sem estudo 2021–2023).
  const trechos: string[] = [];
  let atual: string[] = [];
  vs.forEach((v, i) => { if (v == null) { if (atual.length) trechos.push(atual.join(" ")); atual = []; } else atual.push(`${x(i)},${y(v)}`); });
  if (atual.length) trechos.push(atual.join(" "));
  return `<svg class="bmd-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">${trechos.map((p) =>
    `<polyline points="${p}" fill="none" stroke="${C.o500}" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join("")}</svg>`;
}

function ticks(p: number, marcador?: number | null): string {
  const n = 20, cheios = Math.round(Math.max(0, Math.min(1, p)) * n);
  const m = marcador == null ? "" : `<i class="bmd-ticks__m" style="left:${(marcador * 100).toFixed(1)}%"></i>`;
  return `<div class="bmd-ticks">${Array.from({ length: n }, (_, i) => `<b${i < cheios ? ' class="f"' : ""}></b>`).join("")}${m}</div>`;
}

export function kpi(k: Kpi): string {
  const delta = k.delta ? `<div class="bmd-k__d${k.delta.ruim ? " is-ruim" : ""}">${esc(k.delta.txt)}</div>` : "";
  const titulo = k.exato && k.exato !== k.valor ? ` title="${esc(k.exato)}"` : "";
  return `<div class="bmd-card bmd-k${k.destaque ? " bmd-k--destaque" : ""}">
    <div class="bmd-lbl">${esc(k.rotulo)}</div>
    <div class="bmd-k__v"${titulo}>${esc(k.valor)}</div>${delta}
    ${k.proporcao != null ? ticks(k.proporcao, k.marcador) : ""}
    ${k.nota ? `<div class="bmd-k__n">${esc(k.nota)}</div>` : ""}
    ${k.serie ? sparkline(k.serie) : ""}
  </div>`;
}

/** Ranking clicável (dashboardcn bar-list). Clique delegado em `[data-filtro]`. */
export function barList(grupos: Grupo[], dim: string, fmt: (v: number) => string, ativos: string[] = [], limite = 8): string {
  if (!grupos.length) return "";
  const max = grupos[0]!.valor;
  return `<div class="bmd-bl">${grupos.slice(0, limite).map((g) => `
    <button type="button" class="bmd-bl__i${ativos.includes(g.chave) ? " is-on" : ""}" data-filtro="${dim}" data-v="${esc(g.chave)}" title="${esc(g.chave)}">
      <span class="bmd-bl__k">${esc(g.chave)}</span>
      <span class="bmd-bl__b"><s style="width:${((g.valor / max) * 100).toFixed(1)}%"></s></span>
      <span class="bmd-bl__v bmd-mono">${esc(fmt(g.valor))}</span>
    </button>`).join("")}${grupos.length > limite ? `<div class="bmd-bl__mais">e mais ${grupos.length - limite}</div>` : ""}</div>`;
}

/** Barra 100% (dashboardcn distribution-bar). Até 5 fatias + "Outros". */
export function distribuicao(grupos: Grupo[], dim: string, cores: string[]): string {
  const soma = grupos.reduce((a, g) => a + g.valor, 0);
  if (soma <= 0) return "";
  const top = grupos.slice(0, 5);
  const resto = soma - top.reduce((a, g) => a + g.valor, 0);
  const fatias = resto > 0 ? [...top, { chave: "Outros", valor: resto }] : top;
  const pct = (v: number) => (v / soma) * 100;
  return `<div class="bmd-dist">${fatias.map((g, i) => `<s style="flex:${g.valor};background:${cores[i % cores.length]}" title="${esc(g.chave)} · ${nf(pct(g.valor), 0)}%"></s>`).join("")}</div>
    <div class="bmd-leg2">${fatias.map((g, i) => {
      const clic = g.chave === "Outros" ? "span" : `button type="button" data-filtro="${dim}" data-v="${esc(g.chave)}"`;
      const fecha = g.chave === "Outros" ? "span" : "button";
      return `<${clic}><i style="background:${cores[i % cores.length]}"></i>${esc(g.chave)} ${nf(pct(g.valor), 0)}%</${fecha}>`;
    }).join("")}</div>`;
}

export const skeleton = (n = 4) =>
  `<div class="bmd-skel">${Array.from({ length: n }, () => '<div class="bmd-card bmd-skel__b"></div>').join("")}</div>`;

export const erroCarga = (msg: string) =>
  `<div class="bmd-card bmd-erro"><strong>Não foi possível carregar os dados</strong><p>${esc(msg)}</p>
   <button type="button" data-tentar>${ICONE.repetir}Tentar de novo</button></div>`;

export const cartao = (titulo: string, sub: string, corpo: string, extra = "") =>
  `<section class="bmd-card bmd-sec2"><header><div class="bmd-lbl">${esc(titulo)}</div><span>${sub}</span></header>${extra}${corpo}</section>`;
```

- [ ] **Step 4: dashboard.ts**

```ts
import { alternarFiltro, deHash, definirFiltro, paraHash, trocarFonte, type Estado } from "./estado";
import type { DefAba, Dados } from "./abas/tipos";
import { chips, erroCarga, skeleton } from "./componentes";
import { criarShell } from "./shared/shell";
import { esc } from "./shared/formato";
import type { Aba, Carregar, Fonte, Recurso } from "./types";
import { mercado } from "./abas/mercado";
import { comparativo } from "./abas/comparativo";
import { clientes } from "./abas/clientes";
import { vendas } from "./abas/vendas";

const ABAS: DefAba[] = [mercado, comparativo, clientes, vendas];

const GABARITO = `
  <header class="bmd-hero2"><div><small>BASF | Nunhems · SHIFT BI</small><h1>Inteligência de Mercado</h1></div><small data-el="ultima"></small></header>
  <nav class="bmd-tabs" role="tablist" data-el="tabs"></nav>
  <div class="bmd-barra2"><div class="bmd-barra2__chips" data-el="chips"></div><div class="bmd-barra2__ctl" data-el="ctl"></div></div>
  <div class="bmd-aviso" data-el="aviso" hidden></div>
  <main class="bmd-corpo" data-el="corpo"></main>`;

export interface Montado { destruir(): void }

export function montarDashboard(host: HTMLElement, carregar: Carregar): Montado {
  const shell = criarShell(host, GABARITO);
  let estado: Estado = deHash(location.hash);
  const dados: Dados = {};
  const pendentes = new Map<Recurso, Promise<void>>();
  const falhas = new Map<Recurso, string>();

  const aba = () => ABAS.find((a) => a.id === estado.aba)!;

  function garantir(r: Recurso): Promise<void> {
    if (dados[r] || pendentes.has(r)) return pendentes.get(r) ?? Promise.resolve();
    const p = carregar(r)
      .then((ls) => { dados[r] = ls; falhas.delete(r); })
      .catch((e: unknown) => { falhas.set(r, e instanceof Error ? e.message : String(e)); })
      .finally(() => { pendentes.delete(r); render(); });
    pendentes.set(r, p);
    return p;
  }

  function aviso(txt: string) {
    const el = shell.el("aviso");
    el.textContent = txt;
    el.hidden = !txt;
  }

  function mudar(f: (e: Estado) => Estado) {
    estado = f(estado);
    history.replaceState(null, "", paraHash(estado));
    render();
  }

  function render() {
    const a = aba();
    shell.el("tabs").innerHTML = ABAS.map((x) =>
      `<button type="button" role="tab" data-aba="${x.id}" aria-selected="${x.id === estado.aba}"${x.id === estado.aba ? ' class="is-on"' : ""}>${esc(x.rotulo)}</button>`).join("");
    const meta = dados.meta?.find((m) => m.ultimaVenda);
    shell.el("ultima").textContent = meta ? `última venda ${String(meta.ultimaVenda).split("-").reverse().join("/")}` : "";
    garantir("meta");

    const recursos = a.recursos(estado);
    recursos.forEach(garantir);
    const corpo = shell.el("corpo");
    const falha = recursos.find((r) => falhas.has(r));
    if (falha) { corpo.innerHTML = erroCarga(falhas.get(falha)!); return; }
    if (recursos.some((r) => !dados[r])) { corpo.innerHTML = skeleton(); return; }

    const { dims, origem } = a.chips(estado);
    const base = dados[origem] ?? [];
    const opcoes = (dim: string) =>
      [...new Set(base.map((l) => l[dim]).filter((v) => v != null && v !== "").map(String))]
        .sort((x, y) => (dim === "ano" ? Number(y) - Number(x) : x.localeCompare(y, "pt-BR")));
    shell.el("chips").innerHTML = chips(dims, estado.filtros[estado.aba], opcoes);
    shell.el("ctl").innerHTML = a.controles(estado);
    a.render({ shell, estado, dados, mudar }, corpo);
  }

  shell.aoClicarEm("[data-aba]", (el) => mudar((e) => ({ ...e, aba: el.dataset.aba as Aba, drill: [], clienteAberto: null })));
  shell.aoClicarEm("[data-filtro]", (el) => mudar((e) => alternarFiltro(e, el.dataset.filtro!, el.dataset.v!)));
  shell.aoClicarEm("[data-chip-limpar]", (el) => mudar((e) => definirFiltro(e, el.dataset.chipLimpar!, [])));
  shell.aoClicarEm("[data-tentar]", () => { falhas.clear(); render(); });
  shell.aoClicarEm("[data-seg]", (el) => {
    const nome = el.dataset.seg!, v = el.dataset.v!;
    if (nome === "fonte") {
      const { estado: n, descartados } = trocarFonte(estado, v as Fonte);
      aviso(descartados.length ? `${descartados.join(", ")} não se aplica a ${v.toUpperCase()} — filtro removido.` : "");
      return mudar(() => n);
    }
    aviso("");
    mudar((e) => ({ ...e, [nome]: v, drill: nome === "dim" ? [] : e.drill }));
  });

  const aoMarcar = (ev: Event) => {
    const alvo = ev.target as HTMLInputElement;
    const dim = alvo.dataset?.chipOp;
    if (!dim) return;
    const marcados = Array.from(shell.raiz.querySelectorAll<HTMLInputElement>(`input[data-chip-op="${dim}"]:checked`)).map((i) => i.value);
    mudar((e) => definirFiltro(e, dim, marcados));
  };
  shell.raiz.addEventListener("change", aoMarcar);
  shell.aoDestruir(() => shell.raiz.removeEventListener("change", aoMarcar));
  shell.aoRedimensionar(render);

  render();
  return { destruir: () => shell.destruir() };
}
```

Nota: o `change` de um checkbox de chip redesenha a barra e fecha o `<details>`. Isso é aceitável (uma escolha por abertura). Se incomodar na revisão visual, guarde o `dim` aberto no fechamento do render e reabra o `<details>` correspondente.

- [ ] **Step 5: Abas provisórias para compilar**

Crie `web/basf/src/abas/mercado.ts`, `comparativo.ts`, `clientes.ts`, `vendas.ts`, cada um com este conteúdo (troque `mercado`/`Mercado` pelo id/rótulo da aba e o recurso pelo da aba: mercado→`basf`, comparativo→`resumo`, clientes→`clientes`, vendas→`vendas`). As Tasks 12–15 substituem cada arquivo.

```ts
import type { DefAba } from "./tipos";

export const mercado: DefAba = {
  id: "mercado",
  rotulo: "Mercado",
  recursos: () => ["basf"],
  chips: () => ({ dims: { ano: "Ano" }, origem: "basf" }),
  controles: () => "",
  render: (_ctx, corpo) => { corpo.innerHTML = '<div class="bmd-card">Em construção</div>'; },
};
```

- [ ] **Step 6: preview.ts**

```ts
/** Entrypoint só do preview. No portal quem chama `montarDashboard` é o componente Aurelia. */
import { carregarArquivo } from "./carregar";
import { montarDashboard } from "./dashboard";

montarDashboard(document.getElementById("app")!, carregarArquivo("dados/"));
```

- [ ] **Step 7: dashboard.css — tokens e casca**

Substitua `web/basf/src/dashboard.css` por:

```css
/* Tokens e componentes do BI Mercado. Carregado DEPOIS de shared/estilo.css:
   reaproveita filtros/vazio/voltar do shared e sobrescreve a paleta navy da BFM. */
.bmd {
  --navy-900: #B95D02; --navy: #E07B00; --navy-400: #F39500;
  --accent-ink: #B95D02; --accent-bg: #FFF1DE; --accent-line: #F3D3A6;
  --bg: #FBF7F1; --surface: #FFFFFF; --panel: #F6EFE4;
  --ink: #24180B; --muted: #7D6B57; --faint: #8A7864;
  --border: #ECE2D3; --border-strong: #E0D2BD;
  --o50: #FFF8ED; --o100: #FFEFD4; --o200: #FFDBA8; --o500: #F39500; --o600: #E07B00; --o700: #B95D02;
  --verde: #4F8A2A; --alerta: #C60023;
  font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  min-height: auto;
}
.bmd-mono, .bmd .bmd-mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; }
.bmd-ico { vertical-align: -3px; margin-right: 4px; }

.bmd-hero2 { background: linear-gradient(115deg, var(--o500), var(--o600)); color: #fff; padding: 16px 24px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
.bmd-hero2 h1 { margin: 2px 0 0; font-size: 22px; font-weight: 800; letter-spacing: -.02em; }
.bmd-hero2 small { opacity: .9; font-size: 12px; }

.bmd-tabs { display: flex; gap: 24px; background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 24px; overflow-x: auto; }
.bmd-tabs button { all: unset; cursor: pointer; padding: 12px 0; color: var(--muted); font-weight: 600; white-space: nowrap; transition: color .15s; }
.bmd-tabs button.is-on { color: var(--o700); box-shadow: inset 0 -2px var(--o500); }
.bmd-tabs button:focus-visible { outline: 2px solid var(--o500); outline-offset: 2px; }

.bmd-barra2 { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; padding: 12px 24px; background: var(--surface); border-bottom: 1px solid var(--border); }
.bmd-barra2__chips, .bmd-barra2__ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.bmd-chipf { position: relative; display: inline-flex; align-items: center; border: 1px dashed #D9CBB6; border-radius: 999px; padding: 0 4px 0 0; color: var(--muted); transition: background .15s, border-color .15s; }
.bmd-chipf.is-on { border: 1px solid var(--o500); background: var(--o50); color: var(--o700); font-weight: 600; }
.bmd-chipf .bmd-ms > summary { list-style: none; cursor: pointer; padding: 5px 10px; border: 0; background: none; font-size: 13px; }
.bmd-chipf .bmd-ms > summary::-webkit-details-marker { display: none; }
.bmd-chip-x { all: unset; cursor: pointer; display: inline-flex; padding: 2px; border-radius: 50%; }
.bmd-chip-x:hover { background: var(--o100); }

.bmd-seg2 { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
.bmd-seg2 button { all: unset; cursor: pointer; padding: 5px 12px; font-weight: 600; font-size: 13px; color: var(--muted); border-right: 1px solid var(--border); transition: background .15s; }
.bmd-seg2 button:last-child { border-right: 0; }
.bmd-seg2 button.is-on { background: var(--o100); color: var(--o700); }
.bmd-seg2 button:disabled { cursor: not-allowed; opacity: .45; }

.bmd-aviso { margin: 12px 24px 0; padding: 8px 12px; border-radius: 8px; background: var(--o50); border: 1px solid var(--accent-line); color: var(--o700); font-size: 13px; }
.bmd-corpo { padding: 16px 24px 24px; display: grid; gap: 12px; max-width: 1500px; animation: bmd-entra .2s ease-out; }
@keyframes bmd-entra { from { opacity: .4; } to { opacity: 1; } }

.bmd-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; min-width: 0; }
.bmd-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 600; }
.bmd-sec2 > header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; }
.bmd-sec2 > header > span { color: var(--muted); font-size: 12px; text-align: right; }

.bmd-kpis2 { display: grid; grid-template-columns: 1.25fr repeat(3, 1fr); gap: 12px; }
.bmd-k__v { font-size: 26px; font-weight: 800; letter-spacing: -.02em; margin: 4px 0 2px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bmd-k__d { font-size: 12px; font-weight: 600; color: var(--verde); }
.bmd-k__d.is-ruim { color: var(--alerta); }
.bmd-k__n { color: var(--muted); font-size: 12px; margin-top: 6px; }
.bmd-spark { display: block; width: 100%; height: 28px; margin-top: 6px; }
.bmd-ticks { position: relative; display: flex; gap: 2px; margin-top: 10px; }
.bmd-ticks b { flex: 1; height: 14px; border-radius: 2px; background: var(--o100); }
.bmd-ticks b.f { background: var(--o500); }
.bmd-ticks__m { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--ink); }

.bmd-grid2 { display: grid; grid-template-columns: 1.05fr 1fr; gap: 12px; }
.bmd-pilha { display: grid; gap: 12px; align-content: start; }

.bmd-bl { display: grid; gap: 4px; }
.bmd-bl__i { all: unset; cursor: pointer; display: grid; grid-template-columns: minmax(90px, 140px) 1fr 84px; gap: 8px; align-items: center; padding: 3px 4px; border-radius: 6px; transition: background .15s; }
.bmd-bl__i:hover { background: var(--o50); }
.bmd-bl__i.is-on { background: var(--o100); }
.bmd-bl__k { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bmd-bl__b s { display: block; height: 16px; border-radius: 4px; background: var(--o200); text-decoration: none; }
.bmd-bl__i:first-child .bmd-bl__b s, .bmd-bl__i.is-on .bmd-bl__b s { background: var(--o500); }
.bmd-bl__v { text-align: right; }
.bmd-bl__mais { color: var(--muted); font-size: 12px; padding: 4px; }

.bmd-dist { display: flex; height: 22px; border-radius: 6px; overflow: hidden; margin: 6px 0 8px; }
.bmd-dist s { text-decoration: none; }
.bmd-leg2 { display: flex; flex-wrap: wrap; gap: 6px 14px; color: var(--muted); font-size: 12px; }
.bmd-leg2 button { all: unset; cursor: pointer; }
.bmd-leg2 i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }

.bmd-skel { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.bmd-skel__b { height: 120px; background: linear-gradient(90deg, var(--panel), #fff, var(--panel)); background-size: 200% 100%; animation: bmd-skel 1.2s linear infinite; }
@keyframes bmd-skel { to { background-position: -200% 0; } }
.bmd-erro button { all: unset; cursor: pointer; margin-top: 8px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--o500); color: var(--o700); font-weight: 600; }

.bmd-nota { color: var(--muted); font-size: 12px; margin-top: 8px; }

@media (max-width: 760px) {
  .bmd-kpis2, .bmd-grid2 { grid-template-columns: 1fr; }
  .bmd-hero2, .bmd-tabs, .bmd-barra2, .bmd-corpo { padding-left: 14px; padding-right: 14px; }
}
```


- [ ] **Step 8: Build, tipos e fumaça**

```bash
bun run dash:basf && bunx tsc --noEmit -p . && bun test web/basf
```
Expected: build ok, `tsc` limpo, testes passando.

Fumaça: `bun run dash:basf:serve` (background) e

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 --virtual-time-budget=6000 --screenshot="$TMPDIR/basf-casca.png" "http://localhost:4173/#mercado"
```
Leia o PNG: hero laranja, 4 abas, chip "+ Ano", card "Em construção".

- [ ] **Step 9: Commit**

```bash
git add web/basf/src
git commit -m "feat(basf-dash): casca com abas, chips, carga sob demanda e estados de espera e erro"
```

---

### Task 11: Mapa

**Files:**
- Create: `web/basf/src/mapa.ts`

- [ ] **Step 1: mapa.ts**

```ts
import * as Plot from "@observablehq/plot";
import ufGeo from "./geo/uf.json";
import { ligarClique } from "./shared/drill";
import type { Shell } from "./shared/shell";
import { C } from "./shared/tema";

export interface PontoMapa { lat: number; lon: number; valor: number; rotulo: string }

/** Afastamento mínimo (graus) entre rótulos: Uberaba e São Gotardo ficam a ~1,3°. */
const DIST_ROTULO = 1.5;

function rotulaveis(pontos: PontoMapa[], n: number): PontoMapa[] {
  // ponytail: anti-colisão gulosa em graus, não em pixel. Suficiente para 5 rótulos.
  const escolhidos: PontoMapa[] = [];
  for (const p of [...pontos].sort((a, b) => b.valor - a.valor)) {
    if (escolhidos.every((q) => Math.hypot(q.lat - p.lat, q.lon - p.lon) > DIST_ROTULO)) escolhidos.push(p);
    if (escolhidos.length === n) break;
  }
  return escolhidos;
}

/**
 * Estados pintados pela métrica; pontos por município; 5 maiores rotulados.
 * Clique num estado chama `aoClicarUf(sigla)`.
 */
export function desenharMapa(
  shell: Shell, alvo: string, porUf: Map<string, number>, pontos: PontoMapa[],
  fmt: (v: number) => string, aoClicarUf: (uf: string) => void, ufsAtivas: string[],
): void {
  const geo = ufGeo as unknown as { features: { properties: { uf: string } }[] };
  const alto = Math.min(460, Math.max(300, shell.largura() * 0.45));
  shell.desenhar(alvo, {
    height: alto,
    margin: 4,
    projection: { type: "mercator", domain: ufGeo as never },
    color: { type: "sqrt", range: [C.o100, C.o500], unknown: "#F6EFE4" },
    r: { range: [2, 15] },
    marks: [
      Plot.geo(geo as never, {
        fill: (f: { properties: { uf: string } }) => porUf.get(f.properties.uf),
        stroke: (f: { properties: { uf: string } }) => (ufsAtivas.includes(f.properties.uf) ? C.o700 : "#fff"),
        strokeWidth: (f: { properties: { uf: string } }) => (ufsAtivas.includes(f.properties.uf) ? 2 : 1),
        title: (f: { properties: { uf: string } }) => `${f.properties.uf}: ${porUf.has(f.properties.uf) ? fmt(porUf.get(f.properties.uf)!) : "sem dado"}`,
      }),
      Plot.geo(geo as never, Plot.pointer(Plot.centroid({ stroke: C.o700, strokeWidth: 2, fill: "none" }))),
      Plot.dot(pontos, { x: "lon", y: "lat", r: "valor", fill: C.verde, fillOpacity: 0.55, stroke: "#2F5E14", strokeWidth: 0.8, title: (p: PontoMapa) => `${p.rotulo}: ${fmt(p.valor)}` }),
      Plot.text(rotulaveis(pontos, 5), {
        x: "lon", y: "lat", text: (p: PontoMapa) => `${p.rotulo}  ${fmt(p.valor)}`,
        dx: 12, textAnchor: "start", fontSize: 11, fontWeight: 600, fill: C.ink, stroke: "#fff", strokeWidth: 3,
      }),
    ],
  });
  const svg = shell.svg(alvo);
  if (svg) ligarClique<{ properties: { uf: string } }>(svg, (f) => aoClicarUf(f.properties.uf));
}
```

- [ ] **Step 2: Tipos**

Run: `bunx tsc --noEmit -p .`
Expected: limpo. Se `import ufGeo from "./geo/uf.json"` reclamar, adicione `"resolveJsonModule": true` em `compilerOptions` do `tsconfig.json` (o Bun já importa JSON nativamente).

- [ ] **Step 3: Commit**

```bash
git add web/basf/src/mapa.ts tsconfig.json
git commit -m "feat(basf-dash): mapa de ufs e municipios com clique para filtrar"
```

---

### Task 12: Aba Mercado

**Files:**
- Modify (substituir): `web/basf/src/abas/mercado.ts`

- [ ] **Step 1: Implementação**

```ts
import * as Plot from "@observablehq/plot";
import { agregar, filtrar, share, total, variacao, type Filtros } from "../calc";
import { barList, cartao, distribuicao, kpi, seg, type Kpi } from "../componentes";
import { alternarFiltro } from "../estado";
import { FONTES, linhasIbge, ROTULO_DIM } from "../fontes";
import { desenharMapa, type PontoMapa } from "../mapa";
import { estadoVazio } from "../shared/blocos";
import { esc, moedaCompacta, n0, nf } from "../shared/formato";
import { C, ESCALA } from "../shared/tema";
import type { Linha } from "../types";
import type { Ctx, DefAba } from "./tipos";

const UNIDADE: Record<string, string> = { area: "ha", dose: "TH/ha", th: "TH", volume: "", valor: "" };
const fmtMetrica = (m: string) => (v: number) =>
  m === "valor" ? moedaCompacta(v) : m === "dose" ? `${nf(v, 0)} ${UNIDADE[m]}` : `${n0(Math.round(v))}${UNIDADE[m] ? ` ${UNIDADE[m]}` : ""}`;
const pct = (v: number | null) => (v == null ? "—" : `${nf(v * 100, 1)}%`);
const deltaTxt = (v: number | null, base: string) => (v == null ? null : { txt: `${v >= 0 ? "+" : "−"}${nf(Math.abs(v) * 100, 1)}% vs ${base}`, ruim: v < 0 });

/** Linhas da fonte ativa já no nível certo (IBGE) para a visão pedida. */
function base(ctx: Ctx, visao: "total" | "uf" | "meso" | "mapa"): Linha[] {
  const ls = ctx.dados[ctx.estado.fonte] ?? [];
  if (ctx.estado.fonte !== "ibge") return ls;
  return linhasIbge(ls, visao, !!ctx.estado.filtros.mercado.uf?.length);
}

/** Anos com dado, crescente. Filtro de ano escolhe o "atual"; sem filtro, o último. */
function anos(ls: Linha[]): number[] {
  return [...new Set(ls.map((l) => l.ano).filter((a): a is number => typeof a === "number"))].sort((a, b) => a - b);
}

export const mercado: DefAba = {
  id: "mercado",
  rotulo: "Mercado",
  recursos: (e) => (e.fonte === "basf" ? ["basf", "vendas", "municipios", "meta"] : e.fonte === "ibge" ? ["ibge", "municipios"] : [e.fonte]),
  chips: (e) => ({ dims: FONTES[e.fonte].dims, origem: e.fonte }),
  controles: (e) =>
    seg("fonte", { basf: "BASF", ibge: "IBGE", abcsem: "ABCSEM", cepea: "CEPEA" }, e.fonte) +
    (Object.keys(FONTES[e.fonte].metricas).length > 1 ? seg("metrica", FONTES[e.fonte].metricas, e.metrica) : ""),

  render(ctx, corpo) {
    const { estado: e } = ctx;
    const f: Filtros = e.filtros.mercado;
    const m = e.metrica;
    const fmt = fmtMetrica(m);
    const semAno: Filtros = { ...f, ano: [] };
    const todosAnos = anos(base(ctx, "total"));
    const anoAtual = f.ano?.length ? Math.max(...f.ano.map(Number)) : todosAnos.at(-1);
    const anoAnt = todosAnos.filter((a) => anoAtual != null && a < anoAtual).at(-1);
    const fAtual: Filtros = { ...f, ano: anoAtual != null ? [String(anoAtual)] : [] };
    const fAnt: Filtros = { ...f, ano: anoAnt != null ? [String(anoAnt)] : [] };
    const tot = (ff: Filtros, met = m) => total(filtrar(base(ctx, "total"), ff), met);
    const serie = (met = m) => {
      // Série contínua de anos: ano sem estudo vira null e quebra a sparkline.
      const lo = todosAnos[0], hi = todosAnos.at(-1);
      if (lo == null || hi == null) return [];
      return Array.from({ length: hi - lo + 1 }, (_, i) => tot({ ...semAno, ano: [String(lo + i)] }, met));
    };

    if (tot(fAtual) == null) {
      corpo.innerHTML = `<div class="bmd-card">${estadoVazio("Sem dado neste recorte", `Nenhum registro de <b>${FONTES[e.fonte].rotulo}</b> para os filtros escolhidos. Remova um filtro na barra acima.`)}</div>`;
      return;
    }

    const kpis: Kpi[] = [];
    const baseAnt = anoAnt != null ? String(anoAnt) : "ano anterior";
    if (e.fonte === "basf") {
      // Share: venda do ano civil do estudo ÷ potencial, mesmos filtros. Estado não existe em vendas.
      const fv: Filtros = Object.fromEntries(Object.entries(fAtual).filter(([k]) => ["ano", "crop", "rtv", "regional", "hotspot", "segmento"].includes(k)));
      const vendasAno = f.uf?.length ? null : total(filtrar(ctx.dados.vendas ?? [], fv), "valor");
      const pot = tot(fAtual, "potencial");
      const sh = share(vendasAno, pot);
      kpis.push({
        rotulo: "Share potencial", valor: pct(sh), destaque: true, proporcao: sh,
        nota: f.uf?.length ? "share não se aplica a filtro de estado" : `vendas ${moedaCompacta(vendasAno)} de ${moedaCompacta(pot)}`,
      });
    }
    for (const [met, rot] of Object.entries(FONTES[e.fonte].metricas).slice(0, e.fonte === "basf" ? 2 : 3)) {
      const atual = tot(fAtual, met);
      kpis.push({ rotulo: rot, valor: atual == null ? "—" : fmtMetrica(met)(atual), delta: deltaTxt(variacao(atual, tot(fAnt, met)), baseAnt), serie: serie(met) });
    }
    if (e.fonte === "basf") {
      const pot = tot(fAtual, "potencial");
      kpis.push({ rotulo: "Potencial", valor: moedaCompacta(pot), nota: `€ ${nf((tot(fAtual, "potencialEur") ?? 0) / 1e6, 1)} Mi`, serie: serie("potencial") });
    }

    const def = FONTES[e.fonte];
    const visaoRank = e.fonte === "ibge" ? (e.dim === "meso" ? "meso" : "uf") : "total";
    const ranking = agregar(base(ctx, visaoRank), fAtual, e.dim, m);
    const dimSeg = e.fonte === "basf" ? "segmento" : e.fonte === "abcsem" ? "segmento" : e.fonte === "cepea" ? "produto" : "especie";
    const comp = agregar(base(ctx, "total"), fAtual, dimSeg, m);

    corpo.innerHTML = `
      <div class="bmd-kpis2">${kpis.map(kpi).join("")}</div>
      <div class="bmd-grid2">
        ${def.temMapa ? cartao("Distribuição geográfica", "clique num estado para filtrar", '<div data-el="mapa"></div>') : ""}
        <div class="bmd-pilha">
          ${cartao(`Por ${ROTULO_DIM[e.dim]?.toLowerCase() ?? e.dim}`, esc(def.metricas[m] ?? m),
            barList(ranking, e.dim, fmt, f[e.dim] ?? []) || '<p class="bmd-nota">Sem dado neste recorte.</p>',
            `<div style="margin-bottom:8px">${seg("dim", Object.fromEntries(def.rankings.map((d) => [d, ROTULO_DIM[d] ?? d])), e.dim)}</div>`)}
          ${comp.length > 1 ? cartao(`Composição por ${ROTULO_DIM[dimSeg]?.toLowerCase() ?? dimSeg}`, "", distribuicao(comp, dimSeg, ESCALA)) : ""}
        </div>
      </div>
      ${cartao("Evolução por ano", esc(def.metricas[m] ?? m), '<div data-el="anos"></div>', "")}`;

    if (def.temMapa) {
      const porUf = new Map(agregar(base(ctx, e.fonte === "ibge" ? "uf" : "total"), fAtual, "uf", m).map((g) => [g.chave, g.valor]));
      const munis = new Map((ctx.dados.municipios ?? []).map((x) => [x.cod as number, x]));
      const pontos: PontoMapa[] = e.fonte === "cepea" ? [] : agregar(base(ctx, "mapa"), fAtual, "cod", m).flatMap((g) => {
        const mu = munis.get(Number(g.chave));
        return mu && mu.lat != null && mu.lon != null ? [{ lat: mu.lat as number, lon: mu.lon as number, valor: g.valor, rotulo: String(mu.nome) }] : [];
      });
      desenharMapa(ctx.shell, "mapa", porUf, pontos, fmt, (uf) => ctx.mudar((s) => alternarFiltro(s, "uf", uf)), f.uf ?? []);
    }

    const pontosAno = todosAnos.map((a) => ({ ano: a, v: tot({ ...semAno, ano: [String(a)] }) }));
    const lo = todosAnos[0]!, hi = todosAnos.at(-1)!;
    ctx.shell.desenhar("anos", {
      height: 200, marginLeft: 56,
      x: { type: "band", domain: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), label: null, tickFormat: (v: number) => String(v) },
      y: { grid: true, label: null, tickFormat: (v: number) => fmt(v) },
      marks: [
        Plot.barY(pontosAno.filter((p) => p.v != null), { x: "ano", y: "v", fill: (p: { ano: number }) => (p.ano === anoAtual ? C.o500 : C.o200), rx: 3, title: (p: { ano: number; v: number }) => `${p.ano}: ${fmt(p.v)}` }),
        Plot.ruleY([0]),
      ],
    });
  },
};
```


Regras a respeitar ao revisar este arquivo:
- ano sem estudo aparece como coluna ausente no gráfico de anos (domínio contínuo de `lo` a `hi`), nunca como zero;
- o delta compara com o último ano anterior que tem dado (`anoAnt`) e o texto diz qual;
- filtro de estado com fonte BASF deixa o share em "—" com nota.

- [ ] **Step 2: Verificar**

```bash
bun run dash:basf && bunx tsc --noEmit -p .
```
Com `dash:basf:serve` no ar, screenshot de `http://localhost:4173/#mercado?fonte=basf&f.ano=2024` em 1280px. Conferir no PNG: área semeio 111.587 ha; mapa com MG/BA/GO mais escuros; ranking começando em MG. Depois `#mercado?fonte=ibge`, `#mercado?fonte=abcsem`, `#mercado?fonte=cepea`: cada um renderiza sem erro no console (rode o Edge com `--enable-logging=stderr --v=0` e procure `Uncaught`).

- [ ] **Step 3: Commit**

```bash
git add web/basf/src/abas/mercado.ts
git commit -m "feat(basf-dash): aba mercado com seletor de fonte, kpis, mapa e ranking"
```

---

### Task 13: Aba Comparativo

**Files:**
- Modify (substituir): `web/basf/src/abas/comparativo.ts`

- [ ] **Step 1: Implementação**

```ts
import * as Plot from "@observablehq/plot";
import { agregar, filtrar, total, variacao, type Filtros } from "../calc";
import { cartao, seg } from "../componentes";
import { esc, n0, nf } from "../shared/formato";
import { C, COR_FONTE } from "../shared/tema";
import type { DefAba } from "./tipos";

const FONTES_ORDEM = ["ABCSEM", "IBGE", "CEPEA", "BASF"];
const mil = (v: number) => `${n0(Math.round(v / 1000))} mil`;

export const comparativo: DefAba = {
  id: "comparativo",
  rotulo: "Comparativo",
  recursos: () => ["resumo", "resumoSeg"],
  chips: () => ({ dims: { especie: "Espécie", crop: "Crop", segmento: "Segmento", hy: "HY/OP/F2" }, origem: "resumoSeg" }),
  controles: (e) => seg("metrica", { area: "Área (ha)", th: "Total TH" }, e.metrica === "th" ? "th" : "area"),

  render(ctx, corpo) {
    const m = ctx.estado.metrica === "th" ? "th" : "area";
    const f: Filtros = ctx.estado.filtros.comparativo;
    // `resumo` não tem segmento/hy/crop: com esses filtros a linha por fonte usa só BASF+ABCSEM.
    const usaSeg = ["segmento", "hy", "crop"].some((d) => f[d]?.length);
    const linhas = filtrar(usaSeg ? ctx.dados.resumoSeg ?? [] : ctx.dados.resumo ?? [], { ...f, ano: [] });
    const pontos = FONTES_ORDEM.flatMap((fonte) =>
      agregar(linhas, { fonte: [fonte] }, "ano", m).map((g) => ({ fonte, ano: Number(g.chave), v: g.valor })))
      .sort((a, b) => a.ano - b.ano);

    const ultimos = FONTES_ORDEM.map((fonte) => {
      const ps = pontos.filter((p) => p.fonte === fonte);
      const u = ps.at(-1), a = ps.at(-2);
      return u ? { fonte, ano: u.ano, v: u.v, anoAnt: a?.ano, d: variacao(u.v, a?.v) } : null;
    }).filter((x): x is NonNullable<typeof x> => x != null);

    const ultimoAnoBA = Math.max(...filtrar(ctx.dados.resumoSeg ?? [], { fonte: ["BASF"] }).map((l) => Number(l.ano)));
    const seg2 = agregar(filtrar(ctx.dados.resumoSeg ?? [], { ...f, ano: [String(ultimoAnoBA)], fonte: ["ABCSEM"] }), {}, "segmento", m).slice(0, 6);
    const basfSeg = new Map(agregar(filtrar(ctx.dados.resumoSeg ?? [], { ...f, ano: [String(ultimoAnoBA)], fonte: ["BASF"] }), {}, "segmento", m).map((g) => [g.chave, g.valor]));
    const maxSeg = Math.max(...seg2.map((g) => g.valor), ...basfSeg.values(), 1);

    corpo.innerHTML = `
      ${cartao(`${m === "area" ? "Área" : "Total TH"} de mercado por fonte, por ano`, "a BASF não tem estudo de 2021 a 2023: a linha é interrompida", '<div data-el="linhas"></div>')}
      <div class="bmd-grid2">
        ${cartao("Última informação de cada fonte", "vs ano anterior disponível", `<div class="bmd-ml">${ultimos.map((u) => `
          <div><i style="background:${COR_FONTE[u.fonte]}"></i><b>${esc(u.fonte)}</b><span>${u.ano}</span>
          <span class="bmd-mono">${n0(Math.round(u.v))}${m === "area" ? " ha" : ""}</span>
          <span class="${u.d != null && u.d < 0 ? "bmd-neg" : "bmd-pos"}" title="${u.anoAnt != null ? `vs ${u.anoAnt}` : ""}">${u.d == null ? "—" : `${u.d >= 0 ? "+" : "−"}${nf(Math.abs(u.d) * 100, 1)}%`}</span></div>`).join("")}</div>
          <p class="bmd-nota">Cada delta compara com o ano anterior que a fonte tem (passe o mouse para ver qual).</p>`)}
        ${cartao(`BASF × ABCSEM por segmento · ${ultimoAnoBA}`, m === "area" ? "área (ha)" : "Total TH", `<div class="bmd-par">${seg2.map((g) => {
          const b = basfSeg.get(g.chave) ?? 0;
          return `<button type="button" data-filtro="segmento" data-v="${esc(g.chave)}"><span>${esc(g.chave)}</span>
            <span><s style="width:${(g.valor / maxSeg) * 100}%;background:${C.verde}"></s><s style="width:${(b / maxSeg) * 100}%;background:${C.o500}"></s></span>
            <span class="bmd-mono">${n0(Math.round(g.valor))} / ${b ? n0(Math.round(b)) : "—"}</span></button>`;
        }).join("")}</div><div class="bmd-leg2"><span><i style="background:${C.verde}"></i>ABCSEM</span><span><i style="background:${C.o500}"></i>BASF</span></div>`)}
      </div>`;

    const finais = FONTES_ORDEM.map((fonte) => pontos.filter((p) => p.fonte === fonte).at(-1)).filter((p): p is NonNullable<typeof p> => !!p);
    // dx/dy são constantes no Plot: rótulos que terminam colados (BASF e CEPEA) vão em marcas separadas.
    const ordenados = [...finais].sort((a, b) => b.v - a.v);
    const desloc = new Map<string, number>();
    ordenados.forEach((p, i) => { const prox = ordenados[i - 1]; desloc.set(p.fonte, prox && Math.abs(prox.v - p.v) / Math.max(prox.v, 1) < 0.08 ? 9 : 0); });
    ctx.shell.desenhar("linhas", {
      height: ctx.shell.compacto() ? 240 : 300, marginLeft: 56, marginRight: 120,
      x: { label: null, tickFormat: (v: number) => String(v) },
      y: { grid: true, label: null, tickFormat: (v: number) => (m === "area" ? mil(v) : `${nf(v / 1e6, 0)} Mi`) },
      color: { domain: FONTES_ORDEM, range: FONTES_ORDEM.map((x) => COR_FONTE[x]!) },
      marks: [
        // z quebra a linha onde falta ano consecutivo
        Plot.lineY(pontos, { x: "ano", y: "v", stroke: "fonte", strokeWidth: 2.2, curve: "monotone-x", z: (p: { fonte: string; ano: number }) => `${p.fonte}${pontos.some((q) => q.fonte === p.fonte && q.ano === p.ano - 1) || !pontos.some((q) => q.fonte === p.fonte && q.ano < p.ano) ? "" : p.ano}` }),
        Plot.dot(pontos.filter((p) => p.fonte === "BASF"), { x: "ano", y: "v", fill: COR_FONTE.BASF, r: 3 }),
        Plot.text(finais.filter((p) => !desloc.get(p.fonte)), { x: "ano", y: "v", text: (p: { fonte: string; v: number }) => `${p.fonte}  ${m === "area" ? mil(p.v) : nf(p.v / 1e6, 1) + " Mi"}`, dx: 8, textAnchor: "start", fill: "fonte", fontWeight: 700 }),
        Plot.text(finais.filter((p) => desloc.get(p.fonte)), { x: "ano", y: "v", text: (p: { fonte: string; v: number }) => `${p.fonte}  ${m === "area" ? mil(p.v) : nf(p.v / 1e6, 1) + " Mi"}`, dx: 8, dy: 11, textAnchor: "start", fill: "fonte", fontWeight: 700 }),
      ],
    });
  },
};
```

Problema conhecido no `z` acima: ele só quebra a linha a partir do primeiro ano que vem depois de um buraco, e é isso que precisamos (2024 da BASF depois de 2020). Confira no screenshot que o trecho 2020→2024 da BASF **não** aparece.

Adicione ao `dashboard.css`:

```css
.bmd-ml > div { display: grid; grid-template-columns: 12px 72px 44px 1fr 64px; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid #F4EDE3; }
.bmd-ml > div:last-child { border-bottom: 0; }
.bmd-ml i { width: 10px; height: 10px; border-radius: 3px; display: block; }
.bmd-ml .bmd-mono { text-align: right; }
.bmd-pos, .bmd-neg { text-align: right; font-weight: 600; color: var(--verde); }
.bmd-neg { color: var(--alerta); }
.bmd-par { display: grid; gap: 6px; }
.bmd-par > button { all: unset; cursor: pointer; display: grid; grid-template-columns: minmax(90px, 150px) 1fr 120px; gap: 10px; align-items: center; padding: 2px 4px; border-radius: 6px; }
.bmd-par > button:hover { background: var(--o50); }
.bmd-par s { display: block; height: 7px; border-radius: 3px; text-decoration: none; margin: 2px 0; }
.bmd-par .bmd-mono { text-align: right; }
```

- [ ] **Step 2: Verificar**

`bun run dash:basf && bunx tsc --noEmit -p .`, screenshot de `#comparativo` em 1280px. Conferir: ABCSEM 397.125 ha, IBGE 232.102, CEPEA 112.987, BASF 111.587; BASF com delta vs 2020; rótulos BASF/CEPEA sem sobrepor.

- [ ] **Step 3: Commit**

```bash
git add web/basf/src/abas/comparativo.ts web/basf/src/dashboard.css
git commit -m "feat(basf-dash): aba comparativo com serie por fonte e basf x abcsem"
```

---

### Task 14: Aba Clientes-chave

**Files:**
- Modify (substituir): `web/basf/src/abas/clientes.ts`

- [ ] **Step 1: Implementação**

```ts
import { filtrar, share, total } from "../calc";
import { kpi, seg } from "../componentes";
import { busca, normalizar } from "../shared/filtros";
import { esc, moedaCompacta, n0, nf } from "../shared/formato";
import { ICONE } from "../shared/icones";
import type { Linha } from "../types";
import type { DefAba } from "./tipos";

const pct = (v: number | null) => (v == null ? "—" : `${nf(v * 100, 1)}%`);
const GENERICOS = new Set(["DIVERSOS"]);
const COLS = 8;

function barraShare(v: number | null): string {
  if (v == null) return "—";
  return `<span class="bmd-sh"><s><u style="width:${Math.min(100, v * 100).toFixed(0)}%"></u></s>${nf(v * 100, 0)}%</span>`;
}

function ficha(ls: Linha[]): string {
  const pot = total(ls, "potencial"), vend = total(ls, "vendasPotencial");
  const porCrop = [...new Set(ls.map((l) => String(l.crop)))].map((c) => {
    const x = ls.filter((l) => l.crop === c);
    return `<tr><td>${esc(c)}</td><td class="n bmd-mono">${n0(total(x, "area"))}</td><td class="n bmd-mono">${n0(total(x, "dose"))}</td>
      <td class="n bmd-mono">${n0(total(x, "mercado"))}</td><td class="n bmd-mono">${n0(total(x, "copa") ?? 0)}</td><td class="n bmd-mono">${n0(total(x, "potencial"))}</td></tr>`;
  }).join("");
  const espaco = pot != null ? pot - (vend ?? 0) : null;
  return `<tr class="bmd-ficha"><td colspan="${COLS}"><div>
    <div class="bmd-ficha__g">
      <div class="bmd-card"><span class="bmd-lbl">Potencial cliente</span><b>${moedaCompacta(pot)}</b></div>
      <div class="bmd-card"><span class="bmd-lbl">Vendas BASF</span><b>${moedaCompacta(vend)}</b></div>
      <div class="bmd-card"><span class="bmd-lbl">Espaço a capturar</span><b class="bmd-ac">${moedaCompacta(espaco)}</b></div>
      <div class="bmd-card"><span class="bmd-lbl">Dose média</span><b>${total(ls, "dose") == null ? "—" : `${n0(total(ls, "dose"))} TH/ha`}</b></div>
    </div>
    <table class="bmd-tb2"><thead><tr><th>Crop</th><th class="n">Área</th><th class="n">Dose</th><th class="n">Mercado TH</th><th class="n">Vendas copa</th><th class="n">Potencial R$</th></tr></thead><tbody>${porCrop}</tbody></table>
  </div></td></tr>`;
}

export const clientes: DefAba = {
  id: "clientes",
  rotulo: "Clientes-chave",
  recursos: () => ["clientes", "basf"],
  chips: () => ({ dims: { ano: "Ano", rtv: "RTV", hotspot: "Hotspot", crop: "Crop", acesso: "Acesso" }, origem: "clientes" }),
  controles: (e) => seg("agrupar", { hotspot: "Hotspot", rtv: "RTV", crop: "Crop" }, e.agrupar),

  render(ctx, corpo) {
    const e = ctx.estado;
    const f = e.filtros.clientes;
    const termo = normalizar((corpo.querySelector<HTMLInputElement>(".bmd-busca")?.value ?? "").trim());
    let ls = filtrar(ctx.dados.clientes ?? [], f);
    if (termo) ls = ls.filter((l) => normalizar(String(l.cliente ?? "")).includes(termo));

    const shareCopa = share(total(ls, "copa"), total(ls, "mercado"));
    // 80-20: TH da key list ÷ TH da BASF no mesmo ano/hotspot/crop.
    const fBasf = Object.fromEntries(Object.entries(f).filter(([k]) => ["ano", "hotspot", "crop"].includes(k)));
    const thBasf = total(filtrar(ctx.dados.basf ?? [], { ...fBasf, ano: fBasf.ano ?? ["2024"] }), "th");
    const enx = total(ls, "enxertia");
    const nClientes = new Set(ls.map((l) => l.cliente)).size;

    const grupos = new Map<string, Linha[]>();
    for (const l of ls) { const k = String(l[e.agrupar] ?? "—"); (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(l); }
    const ordem = [...grupos].sort((a, b) => (total(b[1], "mercado") ?? 0) - (total(a[1], "mercado") ?? 0));

    const linhas = ordem.map(([g, xs]) => {
      const porCliente = new Map<string, Linha[]>();
      for (const l of xs) { const k = String(l.cliente); (porCliente.get(k) ?? porCliente.set(k, []).get(k)!).push(l); }
      const cab = `<tr class="bmd-grp"><td colspan="5">${esc(g)} · ${porCliente.size} cliente${porCliente.size > 1 ? "s" : ""}</td>
        <td class="n bmd-mono">${n0(total(xs, "mercado"))}</td><td class="n bmd-mono">${n0(total(xs, "copa") ?? 0)}</td><td>${barraShare(share(total(xs, "copa"), total(xs, "mercado")))}</td></tr>`;
      const cls = [...porCliente].sort((a, b) => (total(b[1], "mercado") ?? 0) - (total(a[1], "mercado") ?? 0)).map(([c, cs]) => {
        const id = `${g}|${c}`;
        const aberto = e.clienteAberto === id;
        const crops = [...new Set(cs.map((x) => String(x.crop)))].map((x) => `<span class="bmd-tag">${esc(x)}</span>`).join(" ");
        const generico = GENERICOS.has(c.toUpperCase()) ? ' <span class="bmd-tag bmd-tag--gen">genérico</span>' : "";
        return `<tr class="bmd-cli${aberto ? " is-open" : ""}" data-cliente="${esc(id)}"><td>${aberto ? ICONE.aberto : ICONE.abrir}<b title="${esc(c)}">${esc(c)}</b>${generico}</td>
          <td>${esc(String(cs[0]!.rtv ?? "—"))}</td><td>${crops}</td><td>${esc(String(cs[0]!.acesso ?? "—"))}</td>
          <td class="n bmd-mono">${n0(total(cs, "area"))}</td><td class="n bmd-mono">${n0(total(cs, "mercado"))}</td>
          <td class="n bmd-mono">${n0(total(cs, "copa") ?? 0)}</td><td>${barraShare(share(total(cs, "copa"), total(cs, "mercado")))}</td></tr>${aberto ? ficha(cs) : ""}`;
      }).join("");
      return cab + cls;
    }).join("");

    const buscaAtual = corpo.querySelector<HTMLInputElement>(".bmd-busca")?.value ?? "";
    corpo.innerHTML = `
      <div class="bmd-kpis2">
        ${kpi({ rotulo: "Customer share (copa)", valor: pct(shareCopa), destaque: true, proporcao: shareCopa, nota: `${nf((total(ls, "copa") ?? 0) / 1e6, 2)} Mi de ${nf((total(ls, "mercado") ?? 0) / 1e6, 2)} Mi TH` })}
        ${kpi({ rotulo: "80-20", valor: pct(share(total(ls, "mercado"), thBasf)), nota: "do mercado BASF está na key list" })}
        ${kpi({ rotulo: "Clientes", valor: n0(nClientes), nota: `${new Set(ls.map((l) => l.rtv)).size} RTVs · ${new Set(ls.map((l) => l.crop)).size} crops` })}
        ${kpi({ rotulo: "Penetração enxertia", valor: pct(share(enx, total(ls, "mercado"))), nota: enx == null ? "sem enxertia preenchida" : "" })}
      </div>
      <div class="bmd-card bmd-tabela">
        <div class="bmd-tabela__topo" data-el="busca"></div>
        <table class="bmd-tb2"><thead><tr><th>Cliente</th><th>RTV</th><th>Crop</th><th>Acesso</th><th class="n">Área (ha)</th><th class="n">Mercado (TH)</th><th class="n">Vendas copa (TH)</th><th>Share</th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="${COLS}" class="bmd-nota">Nenhum cliente neste recorte.</td></tr>`}</tbody></table>
      </div>`;

    const campo = busca("Buscar cliente", [...new Set((ctx.dados.clientes ?? []).map((l) => String(l.cliente)))].sort(), () => ctx.mudar((s) => ({ ...s })));
    ctx.shell.el("busca").append(campo.el);
    const input = campo.el.querySelector<HTMLInputElement>("input")!;
    input.value = buscaAtual;
  },
};
```

No `dashboard.ts`, registre o clique da linha do cliente (abre/fecha a ficha, uma por vez). Adicione junto dos outros `aoClicarEm`:

```ts
shell.aoClicarEm("[data-cliente]", (el) => mudar((e) => ({ ...e, clienteAberto: e.clienteAberto === el.dataset.cliente ? null : el.dataset.cliente! })));
```

Adicione ao `dashboard.css`:

```css
.bmd-tabela { padding: 0; overflow: auto; }
.bmd-tabela__topo { padding: 12px; border-bottom: 1px solid var(--border); max-width: 360px; }
.bmd-tb2 { width: 100%; border-collapse: collapse; font-size: 13px; }
.bmd-tb2 th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); font-weight: 600; position: sticky; top: 0; background: var(--surface); }
.bmd-tb2 td { padding: 8px 10px; border-bottom: 1px solid #F4EDE3; }
.bmd-tb2 .n { text-align: right; }
.bmd-grp td { background: var(--o50); font-weight: 700; color: var(--o700); }
.bmd-cli { cursor: pointer; transition: background .15s; }
.bmd-cli:hover, .bmd-cli.is-open { background: #FFFDF9; }
.bmd-cli b { font-weight: 600; max-width: 280px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
.bmd-tag { display: inline-block; padding: 1px 7px; border-radius: 5px; background: #F2EBE0; color: var(--muted); font-size: 11px; font-weight: 600; }
.bmd-tag--gen { background: #FFF1E8; color: #8A4A2A; }
.bmd-sh { display: inline-flex; align-items: center; gap: 6px; }
.bmd-sh s { display: inline-block; width: 46px; height: 6px; border-radius: 3px; background: var(--o100); position: relative; overflow: hidden; text-decoration: none; }
.bmd-sh u { position: absolute; inset: 0 auto 0 0; background: var(--o500); }
.bmd-ficha > td { background: #FFFDF9; padding: 4px 10px 14px 34px; }
.bmd-ficha__g { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }
.bmd-ficha__g b { display: block; font-size: 17px; font-weight: 800; margin-top: 2px; }
.bmd-ac { color: var(--o700); }
@media (max-width: 760px) { .bmd-ficha__g { grid-template-columns: 1fr 1fr; } }
```

- [ ] **Step 2: Verificar**

`bun run dash:basf && bunx tsc --noEmit -p .`; screenshot de `#clientes` em 1280px. Conferir: customer share 18,9%; 80-20 ≈ 24,9%; 410 clientes. Clique (via screenshot após hash não é possível) — teste manual: abra no navegador, clique num cliente, ficha abre; clique em outro, a primeira fecha.

- [ ] **Step 3: Commit**

```bash
git add web/basf/src/abas/clientes.ts web/basf/src/dashboard.ts web/basf/src/dashboard.css
git commit -m "feat(basf-dash): aba clientes-chave com agrupamento e ficha expansivel"
```

---

### Task 15: Aba Vendas

**Files:**
- Modify (substituir): `web/basf/src/abas/vendas.ts`

- [ ] **Step 1: Implementação**

```ts
import * as Plot from "@observablehq/plot";
import { agregar, atingimento, filtrar, total, variacao, type Filtros } from "../calc";
import { cartao, kpi, seg } from "../componentes";
import { esc, moedaCompacta, n0, nf } from "../shared/formato";
import { C } from "../shared/tema";
import type { Linha } from "../types";
import type { DefAba } from "./tipos";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const BASE_MINIMA = 1000;

export const vendas: DefAba = {
  id: "vendas",
  rotulo: "Vendas",
  recursos: () => ["vendas", "meta"],
  chips: () => ({ dims: { ano: "Ano", crop: "Crop", rtv: "RTV", regional: "Regional", cliente: "Cliente" }, origem: "vendas" }),
  controles: (e) => {
    return seg("moeda", { brl: "R$", eur: "€" }, e.moeda, [], "taxa do ano não cadastrada") + seg("medida", { valor: "Valor", th: "TH" }, e.medida);
  },

  render(ctx, corpo) {
    const e = ctx.estado;
    const f: Filtros = e.filtros.vendas;
    const todas = ctx.dados.vendas ?? [];
    const meta = ctx.dados.meta ?? [];
    const ultima = String(meta.find((m) => m.ultimaVenda)?.ultimaVenda ?? "");
    const anoMax = Math.max(...todas.map((l) => Number(l.ano)));
    const ano = f.ano?.length ? Math.max(...f.ano.map(Number)) : anoMax;
    // Ano corrente corta no mês da última venda; ano fechado vai até dezembro.
    const mesCorte = ano === Number(ultima.slice(0, 4)) ? Number(ultima.slice(5, 7)) : 12;
    const metaAno = meta.find((m) => m.ano === ano);
    const taxa = (a: number) => meta.find((m) => m.ano === a)?.taxa as number | null | undefined;
    const semTaxa = e.moeda === "eur" && !taxa(ano);
    const campo = e.medida === "th" ? "th" : "valor";
    const conv = (v: number | null, a: number) => (v == null || campo === "th" || e.moeda === "brl" ? v : taxa(a) ? v / taxa(a)! : null);
    const fmt = (v: number | null) => campo === "th" ? (v == null ? "—" : `${n0(Math.round(v / 1000))} mil TH`) : e.moeda === "eur" ? (v == null ? "—" : `€ ${nf(v / 1e6, 1)} Mi`) : moedaCompacta(v);

    const recorte = (a: number, ate: number): Linha[] => filtrar(todas, { ...f, ano: [String(a)] }).filter((l) => Number(l.mes) <= ate);
    const ytd = conv(total(recorte(ano, mesCorte), campo), ano);
    const ytdAnt = conv(total(recorte(ano - 1, mesCorte), campo), ano - 1);
    const vol = total(recorte(ano, mesCorte), "th");
    const volAnt = total(recorte(ano - 1, mesCorte), "th");
    const forecast = conv((metaAno?.forecast as number | null) ?? null, ano);
    const budget = conv((metaAno?.budget as number | null) ?? null, ano);
    const ating = campo === "valor" ? atingimento(ytd, forecast) : null;
    const periodo = mesCorte === 12 ? String(ano) : `${ano} até ${MESES[mesCorte - 1]}`;
    const d = (a: number | null, b: number | null) => {
      const v = variacao(a, b, BASE_MINIMA);
      return v == null ? null : { txt: `${v >= 0 ? "+" : "−"}${nf(Math.abs(v) * 100, 1)}% vs ${ano - 1}`, ruim: v < 0 };
    };

    if (semTaxa) {
      corpo.innerHTML = `<div class="bmd-card bmd-nota">Sem taxa de euro cadastrada para ${ano}. Troque para R$ ou cadastre a taxa na meta anual.</div>`;
      return;
    }

    const acum = (a: number) => {
      let s = 0;
      return Array.from({ length: a === ano ? mesCorte : 12 }, (_, i) => {
        s += conv(total(filtrar(todas, { ...f, ano: [String(a)], mes: [String(i + 1)] }), campo), a) ?? 0;
        return { m: i, v: s, serie: String(a) };
      });
    };
    const curva = [...acum(ano - 1), ...acum(ano)];

    const pareado = (dim: string) => {
      const atual = agregar(recorte(ano, mesCorte), {}, dim, campo).slice(0, 6);
      const ant = new Map(agregar(recorte(ano - 1, mesCorte), {}, dim, campo).map((g) => [g.chave, g.valor]));
      const max = Math.max(...atual.map((g) => g.valor), ...atual.map((g) => ant.get(g.chave) ?? 0), 1);
      return `<div class="bmd-par">${atual.map((g) => {
        const a = ant.get(g.chave) ?? null;
        const v = variacao(g.valor, a, BASE_MINIMA);
        return `<button type="button" data-filtro="${dim}" data-v="${esc(g.chave)}"><span title="${esc(g.chave)}">${esc(g.chave)}</span>
          <span><s style="width:${(g.valor / max) * 100}%;background:${C.o500}"></s><s style="width:${((a ?? 0) / max) * 100}%;background:${C.anterior}"></s></span>
          <span class="bmd-mono">${fmt(conv(g.valor, ano))} <em class="${v != null && v < 0 ? "bmd-neg" : "bmd-pos"}">${v == null ? "—" : `${v >= 0 ? "+" : "−"}${nf(Math.abs(v) * 100, 0)}%`}</em></span></button>`;
      }).join("")}</div>`;
    };

    corpo.innerHTML = `
      <div class="bmd-kpis2">
        ${kpi({ rotulo: "Atingimento do forecast anual", destaque: true, valor: ating == null ? "—" : `${nf(ating * 100, 1)}%`,
          proporcao: ating, marcador: mesCorte / 12,
          nota: forecast == null ? `meta não cadastrada para ${ano}` : `${fmt(ytd)} de ${fmt(forecast)} · marcador = ritmo esperado` })}
        ${kpi({ rotulo: `Vendas · ${periodo}`, valor: fmt(ytd), delta: d(ytd, ytdAnt) })}
        ${kpi({ rotulo: `Volume · ${periodo}`, valor: vol == null ? "—" : `${n0(Math.round(vol / 1000))} mil TH`, delta: d(vol, volAnt) })}
        ${kpi({ rotulo: `Budget ${ano}`, valor: budget == null ? "—" : fmt(budget), nota: budget == null ? "meta não cadastrada" : "" })}
      </div>
      ${cartao("Vendas acumuladas no ano", `${ano} contra ${ano - 1}`, '<div data-el="curva"></div>')}
      <div class="bmd-grid2">
        ${cartao(`Por crop · ${periodo}`, `${ano} vs ${ano - 1}`, pareado("crop"))}
        ${cartao(`Por RTV · ${periodo}`, `${ano} vs ${ano - 1}`, pareado("rtv"))}
      </div>`;

    const finais = [String(ano - 1), String(ano)].map((s) => curva.filter((p) => p.serie === s).at(-1)).filter((p): p is NonNullable<typeof p> => !!p);
    ctx.shell.desenhar("curva", {
      height: ctx.shell.compacto() ? 220 : 260, marginLeft: 56, marginRight: 130,
      x: { domain: [0, 11], ticks: 12, tickFormat: (i: number) => MESES[i] ?? "", label: null },
      y: { grid: true, label: null, tickFormat: (v: number) => fmt(v) },
      color: { domain: [String(ano - 1), String(ano)], range: [C.anterior, C.o500] },
      marks: [
        ...(budget != null && campo === "valor" ? [Plot.ruleY([budget], { stroke: C.verde, strokeDasharray: "4 3" }),
          Plot.text([budget], { x: 11, y: (v: number) => v, text: () => `Budget ${ano}`, dy: -7, textAnchor: "end", fill: C.verde, fontWeight: 600 })] : []),
        Plot.areaY(curva.filter((p) => p.serie === String(ano)), { x: "m", y: "v", fill: C.o500, fillOpacity: 0.12, curve: "monotone-x" }),
        Plot.lineY(curva, { x: "m", y: "v", stroke: "serie", strokeWidth: 2.4, curve: "monotone-x" }),
        Plot.dot(finais, { x: "m", y: "v", fill: "serie", r: 3.5 }),
        Plot.text(finais, { x: "m", y: "v", text: (p: { serie: string; v: number }) => `${p.serie}  ${fmt(p.v)}`, dx: 8, textAnchor: "start", fill: "serie", fontWeight: 700 }),
      ],
    });
  },
};
```

Notas para o executor:
- `fmt` aplicado a um valor já convertido não converte de novo. Em `pareado`, `g.valor` é bruto em R$ e passa por `conv` antes do `fmt`.
- O toggle € fica clicável. Se a taxa do ano faltar, o card avisa, em vez de desabilitar o botão sem explicação.

- [ ] **Step 2: Verificar**

`bun run dash:basf && bunx tsc --noEmit -p .`; screenshot de `#vendas`. Conferir: vendas "2026 até jun" = R$ 29,0 mi, delta −29,1%; atingimento "—" com "meta não cadastrada para 2026". Depois `#vendas?f.ano=2024`: atingimento contra o forecast R$ 57,4 mi e linha de budget R$ 46,1 mi.

- [ ] **Step 3: Commit**

```bash
git add web/basf/src/abas/vendas.ts
git commit -m "feat(basf-dash): aba vendas com ytd, curva acumulada e meta anual"
```

---

### Task 16: Verificação visual final

**Files:**
- Modify: `web/basf/README.md` (se houver aprendizado novo)

- [ ] **Step 1: Suite completa**

```bash
bun test && bunx tsc --noEmit -p . && bun run dash:basf:snapshot && bun run dash:basf
```
Expected: tudo verde; `conferir.ts` com todas as âncoras `ok`.

- [ ] **Step 2: Screenshots em três larguras**

Com `bun run dash:basf:serve` em background:

```bash
E="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
for w in 640 1024 1500; do for a in "mercado?fonte=basf" "mercado?fonte=ibge" "mercado?fonte=abcsem" "mercado?fonte=cepea" comparativo clientes vendas; do
  n=$(echo "$a" | tr '?=&' '___')
  "$E" --headless=new --disable-gpu --hide-scrollbars --window-size=$w,1800 --virtual-time-budget=8000 --screenshot="$TMPDIR/basf-$w-$n.png" "http://localhost:4173/#$a"
done; done
```

Leia **cada** PNG. Critérios: nenhum texto cortado ou sobreposto; nenhum `NaN`, `undefined` ou `null` visível; mapa com o Brasil inteiro; colunas viram uma em 640px; skeleton não ficou preso.

- [ ] **Step 3: Corrigir o que aparecer e repetir o Step 2**

Cada correção vira um commit `fix(basf-dash): ...` próprio.

- [ ] **Step 4: Relatório para o usuário**

Entregue: números de reconciliação (saída do `conferir.ts`, incluindo a linha `info` do share 17,9% vs regra nova), conteúdo de `dados/pendencias.json`, e os caminhos dos screenshots. Peça o OK visual com `bun run dash:basf:serve` → `http://localhost:4173`.
