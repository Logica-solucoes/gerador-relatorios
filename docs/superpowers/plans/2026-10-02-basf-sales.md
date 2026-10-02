# BASF Sales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segundo painel do lab `web/basf/`, o "BASF Sales" (substitui o `forecast.pbix`), com 3 abas: Evolução, Análise e Tabela. Usa o mesmo snapshot de vendas do BI Mercado.

**Architecture:**
- `montarDashboard(host, carregar, painel)` passa a receber `{ titulo, abas }`. Os painéis `MERCADO` e `SALES` ficam em `src/paineis.ts`.
- O estado ganha as 3 abas novas, que compartilham filtros entre si.
- O snapshot de vendas ganha a coluna `variedade` e a regra de carteira do RTV (`rtvDe`).
- Lógica pura em `calc.ts`, `estado.ts` e `snapshot/normaliza.ts`, testada com `bun test`. A UI é verificada por screenshot.

**Tech Stack:** Bun, TypeScript estrito (`noUncheckedIndexedAccess`, `noUnusedLocals`), Observable Plot, DOM puro, `mssql` (snapshot).

**Spec:** `docs/superpowers/specs/2026-10-02-basf-sales-design.md`

**Desvios da spec**, decididos na hora de planejar (avisar o usuário):
1. As 3 abas do Sales **compartilham todos os filtros**: filtrar Crop na Evolução vale na Análise e na Tabela.
2. O chip **Variedade** entra na barra. Sem ele, o clique numa barra de variedade criaria um filtro invisível.
3. A busca da Tabela fica no DOM, como na aba Clientes-chave, e não no `Estado`. A spec já dizia "fora do hash", então o comportamento é o mesmo.
4. O `snapshot/vendas.ts` não muda: o `item_desc` já vem no SELECT (como `item`).

**Comandos** (sempre a partir da raiz do repo, `C:\Users\floppydisk\Documents\Trabalho\Gerador-Relatorios`):
- Testes: `bun test web/basf`
- Tipos: `bunx tsc --noEmit -p .`
- Build: `bun run dash:basf && bun run dash:basf:sales` (o segundo só existe a partir da Task 5)
- Servidor: `bun run dash:basf:serve` em segundo plano, em http://localhost:4173

**Screenshot** (Git Bash, Edge headless):
```bash
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
"$EDGE" --headless=new --disable-gpu --hide-scrollbars --window-size=1024,2200 --virtual-time-budget=6000 \
  --screenshot="$TMPDIR/sales-evolucao-1024.png" "http://localhost:4173/sales.html#evolucao"
```
Leia o PNG com a ferramenta Read. Erros de console: acrescente `--enable-logging=stderr --v=0` e procure `Uncaught`.

---

## File Structure

| Arquivo | O que muda |
|---|---|
| `web/basf/snapshot/normaliza.ts` | + `rtvDe` (carteira do RTV) |
| `web/basf/snapshot/normaliza.test.ts` | + testes de `rtvDe` |
| `web/basf/snapshot/montar.ts` | vendas: + `variedade`, RTV por `rtvDe` |
| `web/basf/snapshot/conferir.ts` | + âncoras: TH, Σ por RTV, Σ por variedade |
| `web/basf/src/types.ts` | `Aba` + 3 abas; comentário do `vendas` |
| `web/basf/src/calc.ts` | + `ticket`, `distintos`, `tabelaAnos`, `ordenarAnos` |
| `web/basf/src/calc.test.ts` | + testes das funções novas |
| `web/basf/src/estado.ts` | abas do Sales, `deHash(hash, abas)`, filtros compartilhados, `tabela`/`ordem`/`recolhidos` |
| `web/basf/src/estado.test.ts` | + testes do painel Sales |
| `web/basf/src/paineis.ts` | **novo**: `Painel`, `MERCADO`, `SALES` |
| `web/basf/src/dashboard.ts` | recebe `painel`; título e abas vêm dele |
| `web/basf/src/preview.ts` | passa `MERCADO` |
| `web/basf/src/preview-sales.ts` | **novo**: monta `SALES` |
| `web/basf/sales.html` | **novo**: página do preview do Sales |
| `web/basf/src/componentes.ts` | + `deltaPct`, `pareado` (extraído da aba Vendas) |
| `web/basf/src/abas/vendas.ts` | usa `pareado` de `componentes.ts` |
| `web/basf/src/abas/sales/comum.ts` | **novo**: `recorte`, `controlesBase`, `semResultado`, `ranking`, `DIMS` |
| `web/basf/src/abas/sales/evolucao.ts` | **novo** |
| `web/basf/src/abas/sales/analise.ts` | **novo** |
| `web/basf/src/abas/sales/tabela.ts` | **novo** |
| `web/basf/src/dashboard.css` | + classes da Tabela e do ranking com Δ |
| `package.json` | + `dash:basf:sales` |
| `web/basf/README.md` | + Sales |

Ordem e dependências:
- 1 → 2 (snapshot).
- 3 e 4 são independentes de 1–2 e entre si.
- 5 depende de 4.
- 6 depende de 2, 3 e 5.
- 7 depende de 6.
- 8 depende de 7.
- 9 fecha tudo.

Rodam em paralelo: {1, 3, 4}. A 7 e a 8 mexem nos mesmos arquivos (`paineis.ts`, `dashboard.css`), então rodam em série.

---

### Task 1: `rtvDe` — carteira do RTV no snapshot

**Files:**
- Modify: `web/basf/snapshot/normaliza.ts` (fim do arquivo)
- Test: `web/basf/snapshot/normaliza.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao `web/basf/snapshot/normaliza.test.ts`. Inclua `rtvDe` no import que já existe de `./normaliza`.

```ts
describe("rtvDe", () => {
  const nomes = new Map([["BR10", "Milena Defensor"], ["BR02", "Mariana Vieira"], ["BR04", "Antonio Junior"], ["BR07", "Antônio Pierro"]]);
  test("BR10 vira BR02 nos 3 clientes da regra, só no WMW", () => {
    expect(rtvDe("BR10", "A SEMENTEIRA PROD AGR LTDA", "WMW", nomes)).toEqual({ cod: "BR02", rtv: "Mariana Vieira" });
    expect(rtvDe("BR10", "NATIVA AGRICOLA LTDA", "WMW", nomes)).toEqual({ cod: "BR02", rtv: "Mariana Vieira" });
    expect(rtvDe("BR10", "NATIVO AGRICOLA LTDA ", "WMW", nomes)).toEqual({ cod: "BR02", rtv: "Mariana Vieira" });
  });
  test("fora da regra o RTV fica", () => {
    expect(rtvDe("BR10", "A SEMENTEIRA PROD AGR LTDA", "MEM", nomes)).toEqual({ cod: "BR10", rtv: "Milena Defensor" });
    expect(rtvDe("BR10", "AGRICOLA FAMOSA S/A", "WMW", nomes)).toEqual({ cod: "BR10", rtv: "Milena Defensor" });
    expect(rtvDe("BR01", "A SEMENTEIRA PROD AGR LTDA", "WMW", nomes).cod).toBe("BR01");
  });
  test("ex-RTV rotulado; código sem cadastro mostra o código; sem código é Sem RTV", () => {
    expect(rtvDe("BR04", "X", "MEM", nomes).rtv).toBe("Antonio Junior (ex-RTV)");
    expect(rtvDe("BR07", "X", "MEM", nomes).rtv).toBe("Antônio Pierro (ex-RTV)");
    expect(rtvDe("BR99", "X", "MEM", nomes)).toEqual({ cod: "BR99", rtv: "BR99" });
    expect(rtvDe(null, "X", "MEM", nomes)).toEqual({ cod: null, rtv: "Sem RTV" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test web/basf/snapshot/normaliza.test.ts`
Expected: FAIL — `rtvDe` não exportado.

- [ ] **Step 3: Implementar**

Fim de `web/basf/snapshot/normaliza.ts`:

```ts
const CLIENTES_BR10_PARA_BR02 = new Set(["A SEMENTEIRA PROD AGR LTDA", "NATIVA AGRICOLA LTDA", "NATIVO AGRICOLA LTDA"]);
const EX_RTV = new Set(["BR04", "BR07"]);

/**
 * Carteira do PBI Sales: WMW desses 3 clientes é da BR02, mesmo vindo como BR10. BR04/BR07 saíram
 * do time; o PBI apagava o nome ("(Em branco)"), aqui a venda fica com o nome rotulado.
 */
export function rtvDe(cod: string | null, cliente: string | null, kind: string | null, nomes: Map<string, string>): { cod: string | null; rtv: string } {
  const c = cod === "BR10" && kind === "WMW" && cliente != null && CLIENTES_BR10_PARA_BR02.has(cliente.trim()) ? "BR02" : cod;
  if (!c) return { cod: null, rtv: "Sem RTV" };
  const nome = nomes.get(c) ?? c;
  return { cod: c, rtv: EX_RTV.has(c) ? `${nome} (ex-RTV)` : nome };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test web/basf/snapshot/normaliza.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/basf/snapshot/normaliza.ts web/basf/snapshot/normaliza.test.ts
git commit -m "feat(basf-sales): rtvDe com a carteira do PBI Sales (BR10->BR02, ex-RTV)"
```

---

### Task 2: Snapshot de vendas com variedade e carteira, mais reconciliação

**Files:**
- Modify: `web/basf/snapshot/montar.ts` (bloco "Vendas", hoje nas linhas ~95–117)
- Modify: `web/basf/snapshot/conferir.ts`
- Modify: `web/basf/src/types.ts` (comentário do `vendas`)

Precisa do SQL Server local com o banco `Basf` e de `clients/basf/.env`. Sem banco, **pare e avise**: não invente snapshot.

- [ ] **Step 1: `montar.ts` — RTV e variedade**

No import de `./normaliza`, acrescente `rtvDe`. No bloco de vendas, troque a montagem da linha e a chave. Antes do `for`, logo depois de `const vendasBruto = ...`:

```ts
const nomesRtv = new Map(vendasBruto.linhas.filter((v) => txt(v.rtvCod) && txt(v.rtvNome)).map((v) => [String(v.rtvCod).trim(), String(v.rtvNome).trim()]));
```

Dentro do `for`, substitua a criação de `l` e da chave `k` por:

```ts
  const r = rtvDe(txt(v.rtvCod), txt(v.cliente), txt(v.kind), nomesRtv);
  const l: Linha = {
    ano: v.ano, mes: v.mes, crop, variedade: txt(v.item)?.replace(/^SEMENTES /, "") ?? "Sem variedade",
    rtv: r.rtv, regional: regionalPor.get(String(r.cod)) ?? "Sem regional", cliente: txt(v.cliente),
    hotspot: hotspotPor.get(`${v.custNo}|${crop}`) ?? null,
    segmento: s2 ? segFinal.get(s2) ?? s2 : null, valor: 0, th: 0,
  };
  const k = [l.ano, l.mes, l.crop, l.variedade, l.rtv, l.regional, l.cliente, l.hotspot, l.segmento].join("|");
```

O resto do laço (acumular `valor` e `th`) não muda.

- [ ] **Step 2: `types.ts` — documentar a coluna**

No bloco de comentário de `web/basf/src/types.ts`, troque a linha do `vendas` por:

```
 * vendas     ano, mes, crop, variedade, rtv, regional, cliente, hotspot, segmento, valor, th
 *            (rtv já com a carteira do PBI Sales: snapshot/normaliza.ts rtvDe)
```

- [ ] **Step 3: `conferir.ts` — âncoras novas**

Em `web/basf/snapshot/conferir.ts`, importe `agregar` junto de `filtrar, share, total`. Depois de `const v26 = ...`:

```ts
const somaPor = (ls: Linha[], dim: string) => agregar(ls, {}, dim, "valor").reduce((a, g) => a + g.valor, 0);
```

No array `ancoras`, depois da linha `"Vendas YTD jan-jun 2026 R$"`:

```ts
  ["Vendas YTD jan-jun 2026 TH", total(v26, "th"), 784944, 1],
  ["Σ por RTV = total jan-jun 2026", somaPor(v26, "rtv"), 29022009.43, 1],
  ["Σ por variedade = total jan-jun 2026", somaPor(v26, "variedade"), 29022009.43, 1],
```

- [ ] **Step 4: Rodar o snapshot**

Run: `bun run dash:basf:snapshot`
Expected: todas as linhas `ok` (as 7 antigas e as 3 novas) e exit 0.

- [ ] **Step 5: Medir e conferir a carteira**

```bash
ls -la web/basf/dados/vendas.json
bun -e 'const t=await Bun.file("web/basf/dados/vendas.json").json();const i=(n)=>t.c.indexOf(n);const s=new Map();for(const r of t.r){if(r[i("ano")]!==2026)continue;s.set(r[i("rtv")],(s.get(r[i("rtv")])??0)+r[i("valor")])}console.log(t.r.length,[...s].sort((a,b)=>b[1]-a[1]))'
```

Confira:
- O `vendas.json` tem ≤ 3 MB. **Se passar, pare e avise o usuário**: a spec manda mover a variedade para um recurso próprio, e isso muda o plano.
- Na lista de 2026 aparecem "Mariana Vieira" e nenhum "(Em branco)".
- Os ex-RTV só aparecem se tiverem venda em 2026. Para conferir que existem, rode o mesmo comando com `2025`.

- [ ] **Step 6: Commit**

```bash
git add web/basf/snapshot/montar.ts web/basf/snapshot/conferir.ts web/basf/src/types.ts
git commit -m "feat(basf-sales): snapshot de vendas com variedade e carteira do RTV"
```

---

### Task 3: `calc.ts` — ticket, distintos, tabela por ano

**Files:**
- Modify: `web/basf/src/calc.ts` (fim do arquivo)
- Test: `web/basf/src/calc.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao `web/basf/src/calc.test.ts`. Inclua `distintos, ordenarAnos, tabelaAnos, ticket` no import de `./calc`.

```ts
describe("ticket", () => {
  test("valor por TH; sem volume positivo é null", () => {
    expect(ticket(3600, 100)).toBe(36);
    expect(ticket(3600, 0)).toBeNull();
    expect(ticket(3600, -5)).toBeNull();
    expect(ticket(null, 100)).toBeNull();
  });
});

describe("distintos", () => {
  test("conta só quem tem saldo positivo", () => {
    const ls = [
      { cliente: "A", valor: 10 }, { cliente: "A", valor: -2 },
      { cliente: "B", valor: 5 }, { cliente: "B", valor: -5 },
      { cliente: "C", valor: -1 }, { cliente: null, valor: 9 },
    ];
    expect(distintos(ls, "cliente")).toBe(1);
  });
});

describe("tabelaAnos", () => {
  const V = [
    { ano: 2024, mes: 3, crop: "CAC", variedade: "HANA", valor: 100 },
    { ano: 2025, mes: 2, crop: "CAC", variedade: "HANA", valor: 50 },
    { ano: 2025, mes: 9, crop: "CAC", variedade: "HANA", valor: 70 },
    { ano: 2026, mes: 1, crop: "CAC", variedade: "HANA", valor: 60 },
    { ano: 2026, mes: 8, crop: "CAC", variedade: "HANA", valor: 999 },
    { ano: 2025, mes: 5, crop: "CAC", variedade: "SIRKANA", valor: 30 },
    { ano: 2026, mes: 4, crop: "MEM", variedade: "KICAYA", valor: 40 },
    { ano: 2022, mes: 1, crop: "MEM", variedade: "VELHA", valor: 5 },
  ];
  const t = tabelaAnos(V, "variedade", "crop", 2026, 6, "valor");
  const cac = t.grupos.find((g) => g.chave === "CAC")!;
  test("colunas: 2 anos fechados + YTD; mês depois do corte fica fora", () => {
    expect(cac.v).toEqual([100, 120, 60]);
    expect(t.total.v).toEqual([100, 150, 100]);
  });
  test("variação é YTD contra YTD do ano anterior, não contra o ano cheio", () => {
    expect(cac.variacao).toBeCloseTo(60 / 80 - 1);
    expect(cac.itens.find((i) => i.chave === "HANA")!.variacao).toBeCloseTo(60 / 50 - 1);
    expect(t.total.variacao).toBeCloseTo(100 / 80 - 1);
  });
  test("sem venda é null, nunca 0; item fora das 3 colunas some", () => {
    expect(cac.itens.find((i) => i.chave === "SIRKANA")!.v).toEqual([null, 30, null]);
    expect(cac.itens.find((i) => i.chave === "SIRKANA")!.variacao).toBeNull();
    const mem = t.grupos.find((g) => g.chave === "MEM")!;
    expect(mem.itens.map((i) => i.chave)).toEqual(["KICAYA"]);
  });
  test("conversão por ano entra antes da variação", () => {
    const meio = tabelaAnos(V, "variedade", "crop", 2026, 6, "valor", (v, a) => (v == null ? v : a === 2026 ? v / 2 : v));
    expect(meio.total.v[2]).toBe(50);
    expect(meio.total.variacao).toBeCloseTo(50 / 80 - 1);
  });
  test("sem grupo: um grupo só, lista plana", () => {
    const plano = tabelaAnos(V, "variedade", null, 2026, 6, "valor");
    expect(plano.grupos.length).toBe(1);
    expect(plano.grupos[0]!.itens.map((i) => i.chave).sort()).toEqual(["HANA", "KICAYA", "SIRKANA"]);
  });
  test("base mínima anula a variação", () => {
    expect(tabelaAnos(V, "variedade", "crop", 2026, 6, "valor", (v) => v, 1000).total.variacao).toBeNull();
  });
});

describe("ordenarAnos", () => {
  const ls = [
    { chave: "b", v: [null, null, 10] as (number | null)[], variacao: 0.5 },
    { chave: "a", v: [null, null, null] as (number | null)[], variacao: null },
    { chave: "c", v: [null, null, 30] as (number | null)[], variacao: -0.2 },
  ];
  test("por coluna, null sempre no fim", () => {
    expect(ordenarAnos(ls, 2, true).map((l) => l.chave)).toEqual(["c", "b", "a"]);
    expect(ordenarAnos(ls, 2, false).map((l) => l.chave)).toEqual(["b", "c", "a"]);
    expect(ordenarAnos(ls, 3, true).map((l) => l.chave)).toEqual(["b", "c", "a"]);
  });
  test("coluna -1 é o nome; não muta a entrada", () => {
    expect(ordenarAnos(ls, -1, false).map((l) => l.chave)).toEqual(["a", "b", "c"]);
    expect(ls.map((l) => l.chave)).toEqual(["b", "a", "c"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test web/basf/src/calc.test.ts`
Expected: FAIL — funções não exportadas.

- [ ] **Step 3: Implementar**

Fim de `web/basf/src/calc.ts`:

```ts
/** Preço médio por TH. Volume ≤ 0 (só devolução) não tem leitura. */
export function ticket(valor: N, th: N): number | null {
  return ok(valor) && ok(th) && th > 0 ? valor / th : null;
}

/** Quantos `dim` distintos têm saldo positivo: cliente que só devolveu não "comprou". */
export function distintos(ls: Linha[], dim: string, metrica = "valor"): number {
  return agregar(ls, {}, dim, metrica).filter((g) => g.valor > 0).length;
}

export interface LinhaAnos { chave: string; v: (number | null)[]; variacao: number | null }
export interface GrupoAnos extends LinhaAnos { itens: LinhaAnos[] }
type Conv = (v: number | null, ano: number) => number | null;

function agrupar(ls: Linha[], dim: string): Map<string, Linha[]> {
  const m = new Map<string, Linha[]>();
  for (const l of ls) { const k = String(l[dim] ?? "—"); (m.get(k) ?? m.set(k, []).get(k)!).push(l); }
  return m;
}

/**
 * Aba Tabela do Sales. Colunas `v`: ano-2 e ano-1 cheios, `ano` até o corte. Variação: YTD contra o
 * YTD do ano anterior. `grupo` null = um grupo só (lista plana). Sem venda = null, nunca 0.
 */
export function tabelaAnos(ls: Linha[], dim: string, grupo: string | null, ano: number, mesCorte: number, metrica: string, conv: Conv = (v) => v, baseMinima = 0): { grupos: GrupoAnos[]; total: LinhaAnos } {
  const doRecorte = ls.filter((l) => {
    const a = l.ano as number;
    return (a === ano - 2 || a === ano - 1 || a === ano) && (a !== ano || (l.mes as number) <= mesCorte);
  });
  const linha = (chave: string, xs: Linha[]): LinhaAnos => {
    const doAno = (a: number, ate = 12) => conv(total(xs.filter((l) => l.ano === a && (l.mes as number) <= ate), metrica), a);
    const ytd = doAno(ano, mesCorte);
    return { chave, v: [doAno(ano - 2), doAno(ano - 1), ytd], variacao: variacao(ytd, doAno(ano - 1, mesCorte), baseMinima) };
  };
  const grupos = [...(grupo ? agrupar(doRecorte, grupo) : new Map([["", doRecorte]]))]
    .map(([g, xs]) => ({ ...linha(g, xs), itens: [...agrupar(xs, dim)].map(([k, ys]) => linha(k, ys)) }));
  return { grupos, total: linha("Total", doRecorte) };
}

/** Coluna 0–2 = `v[col]`, 3 = variação, -1 = nome. Vazio vai para o fim nos dois sentidos. */
export function ordenarAnos<T extends LinhaAnos>(ls: T[], col: number, desc: boolean): T[] {
  if (col === -1) return [...ls].sort((a, b) => (desc ? -1 : 1) * a.chave.localeCompare(b.chave, "pt-BR"));
  const val = (l: T) => (col === 3 ? l.variacao : l.v[col] ?? null);
  return [...ls].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return desc ? y - x : x - y;
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test web/basf/src/calc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/basf/src/calc.ts web/basf/src/calc.test.ts
git commit -m "feat(basf-sales): ticket, distintos e tabela por ano no calc"
```

---

### Task 4: Estado com as abas do Sales

**Files:**
- Modify: `web/basf/src/types.ts:9`
- Modify: `web/basf/src/estado.ts`
- Test: `web/basf/src/estado.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao `web/basf/src/estado.test.ts`. Inclua `ABAS_SALES` no import de `./estado`.

```ts
describe("painel Sales", () => {
  test("hash com aba fora do painel cai na primeira aba do painel", () => {
    expect(deHash("#mercado", ABAS_SALES).aba).toBe("evolucao");
    expect(deHash("", ABAS_SALES).aba).toBe("evolucao");
    expect(deHash("#evolucao").aba).toBe("mercado");
  });
  test("filtro do Sales vale nas 3 abas e não vaza para o Mercado", () => {
    const e = definirFiltro(inicial("analise"), "crop", ["MEM"]);
    expect(e.filtros.evolucao.crop).toEqual(["MEM"]);
    expect(e.filtros.tabela.crop).toEqual(["MEM"]);
    expect(e.filtros.vendas.crop).toBeUndefined();
  });
  test("ida e volta: aba, filtros, corte e modo da tabela", () => {
    let e = { ...inicial("tabela"), mesCorte: 4, tabela: "cliente" as const };
    e = definirFiltro(e, "rtv", ["Mariana Vieira"]);
    const volta = deHash(paraHash(e), ABAS_SALES);
    expect(volta.aba).toBe("tabela");
    expect(volta.mesCorte).toBe(4);
    expect(volta.tabela).toBe("cliente");
    expect(volta.filtros.evolucao.rtv).toEqual(["Mariana Vieira"]);
  });
  test("modo da tabela só vai no hash da aba Tabela", () => {
    expect(paraHash({ ...inicial("evolucao"), tabela: "cliente" })).not.toContain("tab=");
    expect(deHash("#tabela?tab=zzz", ABAS_SALES).tabela).toBe("variedade");
  });
  test("ordem e grupos recolhidos têm padrão e não vão no hash", () => {
    const e = inicial("tabela");
    expect(e.ordem).toEqual({ col: 2, desc: true });
    expect(e.recolhidos).toEqual([]);
    expect(paraHash({ ...e, recolhidos: ["CAC"] })).not.toContain("CAC");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test web/basf/src/estado.test.ts`
Expected: FAIL — `ABAS_SALES` não exportado e `inicial` não aceita aba.

- [ ] **Step 3: `types.ts`**

```ts
export type Aba = "mercado" | "comparativo" | "clientes" | "vendas" | "evolucao" | "analise" | "tabela";
```

- [ ] **Step 4: `estado.ts`**

Interface `Estado`: acrescente depois de `clienteAberto`:

```ts
  /** Aba Tabela do Sales: linhas por variedade (agrupadas por crop) ou por cliente. */
  tabela: "variedade" | "cliente";
  /** Ordenação da Tabela (fora do hash): coluna de `ordenarAnos` e sentido. */
  ordem: { col: number; desc: boolean };
  /** Crops recolhidos na Tabela (fora do hash). */
  recolhidos: string[];
```

Troque as constantes `ABAS` e `COMPARTILHA_ANO` por:

```ts
export const ABAS_MERCADO: Aba[] = ["mercado", "comparativo", "clientes", "vendas"];
export const ABAS_SALES: Aba[] = ["evolucao", "analise", "tabela"];
const ABAS: Aba[] = [...ABAS_MERCADO, ...ABAS_SALES];
const COMPARTILHA_ANO: Aba[] = ["mercado", "comparativo"];
const COM_CORTE: Aba[] = ["vendas", ...ABAS_SALES];
```

`inicial`:

```ts
export function inicial(aba: Aba = "mercado"): Estado {
  return {
    aba, fonte: "basf",
    filtros: Object.fromEntries(ABAS.map((a) => [a, {}])) as Record<Aba, Filtros>,
    metrica: "area", moeda: "brl", medida: "valor", agrupar: "hotspot", itemCepea: "Área Cepea", mesCorte: null, dim: "uf",
    drill: [], clienteAberto: null, tabela: "variedade", ordem: { col: 2, desc: true }, recolhidos: [],
  };
}
```

Em `copiar`, acrescente `recolhidos: [...e.recolhidos],` ao lado de `drill`.

Em `definirFiltro`, troque a linha `const alvos = ...` por:

```ts
  // Sales: as 3 abas são vistas do mesmo recorte. Mercado/Comparativo: só o ano anda junto.
  const alvos = ABAS_SALES.includes(e.aba) ? ABAS_SALES : dim === "ano" && COMPARTILHA_ANO.includes(e.aba) ? COMPARTILHA_ANO : [e.aba];
```

Em `paraHash`, troque a linha do `corte` por estas duas:

```ts
  if (COM_CORTE.includes(e.aba) && e.mesCorte != null) p.set("corte", String(e.mesCorte));
  if (e.aba === "tabela") p.set("tab", e.tabela);
```

Em `deHash`, troque a assinatura e as duas primeiras linhas úteis por:

```ts
export function deHash(hash: string, abas: Aba[] = ABAS_MERCADO): Estado {
  const e = inicial(abas[0]);
  const [abaTxt = "", query = ""] = hash.replace(/^#/, "").split("?");
  if (!abas.includes(abaTxt as Aba)) return e;
```

E, logo depois da linha `if (Number.isInteger(corte) ...`:

```ts
  if (p.get("tab") === "cliente") n.tabela = "cliente";
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test web/basf/src/estado.test.ts && bunx tsc --noEmit -p .`
Expected: PASS em todos os testes (inclusive os antigos de hash) e tsc sem erro.

- [ ] **Step 6: Commit**

```bash
git add web/basf/src/types.ts web/basf/src/estado.ts web/basf/src/estado.test.ts
git commit -m "feat(basf-sales): estado com as abas do Sales e deHash por painel"
```

---

### Task 5: Painel como parâmetro do `montarDashboard`

**Files:**
- Create: `web/basf/src/paineis.ts`
- Modify: `web/basf/src/dashboard.ts`
- Modify: `web/basf/src/preview.ts`

- [ ] **Step 1: `paineis.ts`**

```ts
import type { DefAba } from "./abas/tipos";
import { mercado } from "./abas/mercado";
import { comparativo } from "./abas/comparativo";
import { clientes } from "./abas/clientes";
import { vendas } from "./abas/vendas";

/** Um dashboard = título do hero + abas. O shell, o estado e os dados são os mesmos. */
export interface Painel { titulo: string; abas: DefAba[] }

export const MERCADO: Painel = { titulo: "Inteligência de Mercado", abas: [mercado, comparativo, clientes, vendas] };
```

- [ ] **Step 2: `dashboard.ts`**

- Remova os 4 imports de `./abas/...` e a constante `ABAS`. Acrescente `import type { Painel } from "./paineis";`.
- `GABARITO` vira uma função. Troque `` const GABARITO = ` `` por `` const gabarito = (titulo: string) => ` `` e, dentro dela, `<h1>Inteligência de Mercado</h1>` por `<h1>${esc(titulo)}</h1>`.
- Assinatura e as primeiras linhas do corpo:

```ts
export function montarDashboard(host: HTMLElement, carregar: Carregar, painel: Painel): Montado {
  const shell = criarShell(host, gabarito(painel.titulo));
  let estado: Estado = deHash(location.hash, painel.abas.map((a) => a.id));
```

- Troque as duas ocorrências restantes de `ABAS` por `painel.abas`: em `const aba = () => ...` e em `shell.el("tabs").innerHTML = ...`.

- [ ] **Step 3: `preview.ts`**

```ts
/** Entrypoint só do preview. No portal quem chama `montarDashboard` é o componente Aurelia. */
import { carregarArquivo } from "./carregar";
import { montarDashboard } from "./dashboard";
import { MERCADO } from "./paineis";

montarDashboard(document.getElementById("app")!, carregarArquivo("dados/"), MERCADO);
```

- [ ] **Step 4: Verificar que o Mercado não mudou**

Run: `bunx tsc --noEmit -p . && bun test web/basf && bun run dash:basf`
Expected: tsc limpo, testes verdes, bundle gerado.

Com o `dash:basf:serve` no ar, tire o screenshot de `http://localhost:4173/#mercado` em 1024px (comando no topo). O hero tem que dizer "Inteligência de Mercado", com 4 abas e o mapa desenhado.

- [ ] **Step 5: Commit**

```bash
git add web/basf/src/paineis.ts web/basf/src/dashboard.ts web/basf/src/preview.ts
git commit -m "refactor(basf-dash): montarDashboard recebe o painel (titulo + abas)"
```

---

### Task 6: Base do Sales + aba Evolução + preview

**Files:**
- Create: `web/basf/src/abas/sales/comum.ts`
- Create: `web/basf/src/abas/sales/evolucao.ts`
- Create: `web/basf/src/preview-sales.ts`
- Create: `web/basf/sales.html`
- Modify: `web/basf/src/paineis.ts`
- Modify: `web/basf/src/componentes.ts` (+ `deltaPct`)
- Modify: `package.json` (scripts)
- Modify: `web/basf/README.md`

- [ ] **Step 1: `deltaPct` em `componentes.ts`**

Acrescente ao fim de `web/basf/src/componentes.ts`:

```ts
/** "+12%" / "−8%" / "—": variação curta para listas e tabelas. */
export const deltaPct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${nf(Math.abs(v) * 100, 0)}%`);
```

- [ ] **Step 2: `abas/sales/comum.ts`**

```ts
import { filtrar, mesDeCorte, mesMaximo, total, variacao } from "../../calc";
import { deltaPct, seg } from "../../componentes";
import { definirFiltro, type Estado } from "../../estado";
import { estadoVazio } from "../../shared/blocos";
import { esc, euroCompacto, moedaCompacta, n0, nf } from "../../shared/formato";
import type { Linha } from "../../types";
import type { Ctx, Dados } from "../tipos";

export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const BASE_MINIMA = 1000;
export const DIMS: Record<string, string> = { ano: "Ano", crop: "Crop", variedade: "Variedade", regional: "Regional", rtv: "RTV", cliente: "Cliente" };

const ultimaVenda = (d: Dados) => String(d.meta?.find((m) => m.ultimaVenda)?.ultimaVenda ?? "");
const taxaDe = (d: Dados, a: number) => d.meta?.find((m) => m.ano === a)?.taxa as number | null | undefined;

/** Maior ano do chip Ano; sem chip, o maior ano com venda. */
export function anoReferencia(e: Estado, d: Dados): number {
  const f = e.filtros[e.aba].ano;
  return f?.length ? Math.max(...f.map(Number)) : Math.max(...(d.vendas ?? []).map((l) => Number(l.ano)));
}

/** Corte, R$/€ e Valor/TH, como na aba Vendas. € desabilitado sem taxa do ano. */
export function controlesBase(e: Estado, d: Dados): string {
  const ano = anoReferencia(e, d);
  const max = mesMaximo(ano, ultimaVenda(d));
  const corte = `<select class="bmd-sel" data-corte aria-label="Mês de corte" title="Mês de corte"><option value=""${e.mesCorte == null ? " selected" : ""}>Corte: auto</option>${MESES.map((m, i) =>
    `<option value="${i + 1}"${e.mesCorte === i + 1 ? " selected" : ""}${i + 1 > max ? " disabled" : ""}>Até ${m}</option>`).join("")}</select>`;
  return corte + seg("moeda", { brl: "R$", eur: "€" }, e.moeda, taxaDe(d, ano) ? [] : ["eur"], "taxa do ano não cadastrada") + seg("medida", { valor: "Valor", th: "TH" }, e.medida);
}

export interface Recorte {
  ano: number;
  mesCorte: number;
  /** "2026 até jun" ou "2025" (ano fechado). */
  periodo: string;
  campo: "valor" | "th";
  /** € efetivo: pedido E taxa do ano cadastrada. */
  eur: boolean;
  /** Base mínima da variação na métrica ativa (R$ 1 mil em valor; nenhuma em TH). */
  minimo: number;
  /** Vendas com os filtros da aba menos o de ano: o ano anterior entra na comparação. */
  base: Linha[];
  /** Linhas do ano `a` até o mês de corte. */
  ytd(a: number): Linha[];
  /** R$ → € pela taxa do ano `a` (identidade em R$). */
  moeda(v: number | null, a: number): number | null;
  /** Converte um valor já somado na métrica ativa (TH não converte). */
  conv(v: number | null, a: number): number | null;
  /** Soma das linhas na métrica ativa, convertida. */
  medir(ls: Linha[], a: number): number | null;
  fmt(v: number | null): string;
  fmtValor(v: number | null): string;
  fmtTH(v: number | null): string;
  delta(atual: number | null, ant: number | null, base?: number): { txt: string; ruim: boolean } | null;
}

export function recorte(ctx: Ctx): Recorte {
  const e = ctx.estado, d = ctx.dados;
  const ano = anoReferencia(e, d);
  const mesCorte = mesDeCorte(e.mesCorte, ano, ultimaVenda(d));
  const eur = e.moeda === "eur" && !!taxaDe(d, ano);
  const campo = e.medida === "th" ? "th" : "valor";
  const semAno = Object.fromEntries(Object.entries(e.filtros[e.aba]).filter(([dim]) => dim !== "ano"));
  const base = filtrar(d.vendas ?? [], semAno);
  const moeda = (v: number | null, a: number) => {
    const t = taxaDe(d, a);
    return v == null || !eur ? v : t ? v / t : null;
  };
  const conv = (v: number | null, a: number) => (campo === "th" ? v : moeda(v, a));
  const fmtValor = (v: number | null) => (eur ? euroCompacto(v) : moedaCompacta(v));
  const fmtTH = (v: number | null) => (v == null ? "—" : Math.abs(v) >= 1e4 ? `${n0(Math.round(v / 1000))} mil TH` : `${n0(v)} TH`);
  return {
    ano, mesCorte, campo, eur, base, moeda, conv, fmtValor, fmtTH,
    minimo: campo === "valor" ? BASE_MINIMA : 0,
    periodo: mesCorte === 12 ? String(ano) : `${ano} até ${MESES[mesCorte - 1]}`,
    ytd: (a) => base.filter((l) => l.ano === a && (l.mes as number) <= mesCorte),
    medir: (ls, a) => conv(total(ls, campo), a),
    fmt: (v) => (campo === "th" ? fmtTH(v) : fmtValor(v)),
    delta: (a, b, min = 0) => {
      const v = variacao(a, b, min);
      return v == null ? null : { txt: `${v >= 0 ? "+" : "−"}${nf(Math.abs(v) * 100, 1)}% vs ${ano - 1}`, ruim: v < 0 };
    },
  };
}

/** Filtro que zerou tudo: cada filtro removível + limpar todos. */
export function semResultado(ctx: Ctx, corpo: HTMLElement): void {
  const f = ctx.estado.filtros[ctx.estado.aba];
  const botoes = Object.entries(f).filter(([, vs]) => vs.length).map(([dim, vs]) =>
    `<button type="button" class="bmd-voltar" data-chip-limpar="${esc(dim)}">${esc(DIMS[dim] ?? dim)}: ${esc(vs.join(", "))} ×</button>`).join(" ");
  corpo.innerHTML = `<div class="bmd-card">${estadoVazio("Sem venda neste recorte", "Nenhuma venda com estes filtros. Remova um:")}
    <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:-16px">${botoes}<button type="button" class="bmd-voltar" data-limpar-tudo>Limpar filtros</button></div></div>`;
  corpo.querySelector("[data-limpar-tudo]")?.addEventListener("click", () =>
    ctx.mudar((s) => Object.keys(s.filtros[s.aba]).reduce((x, dim) => definirFiltro(x, dim, []), s)));
}

export interface ItemPar { chave: string; atual: number; anterior: number | null }

/** Itens de `dim` no YTD atual (ordem do atual), com o valor do YTD anterior ao lado. */
export function pares(r: Recorte, dim: string, limite: number): ItemPar[] {
  const somar = (ls: Linha[]) => {
    const m = new Map<string, Linha[]>();
    for (const l of ls) { const k = l[dim]; if (k == null || k === "") continue; (m.get(String(k)) ?? m.set(String(k), []).get(String(k))!).push(l); }
    return m;
  };
  const ant = somar(r.ytd(r.ano - 1));
  return [...somar(r.ytd(r.ano))]
    .map(([chave, ls]) => ({ chave, atual: r.medir(ls, r.ano) ?? 0, anterior: ant.has(chave) ? r.medir(ant.get(chave)!, r.ano - 1) : null }))
    .filter((i) => i.atual !== 0)
    .sort((a, b) => b.atual - a.atual)
    .slice(0, limite);
}

/** bar-list com Δ (mesmo markup do `barList`: o maior em laranja, o resto em verde). Clique filtra. */
export function ranking(itens: ItemPar[], dim: string, r: Recorte, ativos: string[]): string {
  if (!itens.length) return '<p class="bmd-nota">Sem venda no período.</p>';
  const max = Math.max(itens[0]!.atual, 1);
  return `<div class="bmd-bl bmd-bl--delta">${itens.map((i) => {
    const v = variacao(i.atual, i.anterior, r.minimo);
    return `<button type="button" class="bmd-bl__i${ativos.includes(i.chave) ? " is-on" : ""}" data-filtro="${dim}" data-v="${esc(i.chave)}" title="${esc(i.chave)}">
      <span class="bmd-bl__k">${esc(i.chave)}</span>
      <span class="bmd-bl__b"><s style="width:${((Math.max(0, i.atual) / max) * 100).toFixed(1)}%"></s></span>
      <span class="bmd-bl__v bmd-mono">${esc(r.fmt(i.atual))}<em class="${v != null && v < 0 ? "bmd-neg" : "bmd-pos"}">${deltaPct(v)}</em></span>
    </button>`;
  }).join("")}</div>`;
}
```

- [ ] **Step 3: `abas/sales/evolucao.ts`**

```ts
import * as Plot from "@observablehq/plot";
import { ticket, total } from "../../calc";
import { cartao, kpi } from "../../componentes";
import { legenda } from "../../shared/blocos";
import { nf } from "../../shared/formato";
import { C, VERDE } from "../../shared/tema";
import type { Linha } from "../../types";
import type { DefAba } from "../tipos";
import { BASE_MINIMA, DIMS, MESES, controlesBase, recorte, semResultado } from "./comum";

export const evolucao: DefAba = {
  id: "evolucao",
  rotulo: "Evolução",
  recursos: () => ["vendas", "meta"],
  chips: () => ({ dims: DIMS, origem: "vendas" }),
  controles: controlesBase,

  render(ctx, corpo) {
    const r = recorte(ctx);
    const { ano, mesCorte } = r;
    const anos = [...new Set(r.base.map((l) => l.ano as number))].filter((a) => a <= ano).sort((a, b) => a - b);
    if (!anos.length) return semResultado(ctx, corpo);

    const atual = r.ytd(ano), ant = r.ytd(ano - 1);
    const vend = r.moeda(total(atual, "valor"), ano), vendAnt = r.moeda(total(ant, "valor"), ano - 1);
    const vol = total(atual, "th"), volAnt = total(ant, "th");
    const med = r.medir(atual, ano), medAnt = r.medir(ant, ano - 1);
    const dif = med != null && medAnt != null ? med - medAnt : null;
    const tk = ticket(vend, vol), tkAnt = ticket(vendAnt, volAnt);
    const fmtTicket = (v: number | null) => (v == null ? "—" : `${r.eur ? "€" : "R$"} ${nf(v, 2)}/TH`);

    // Soma uma vez por ano|mês: as três visões abaixo leem daqui.
    const porMes = new Map<string, Linha[]>();
    for (const l of r.base) { const k = `${l.ano}|${l.mes}`; (porMes.get(k) ?? porMes.set(k, []).get(k)!).push(l); }
    const noMes = (a: number, i: number) => r.medir(porMes.get(`${a}|${i + 1}`) ?? [], a) ?? 0;
    const meses = (a: number) => (a === ano ? mesCorte : 12);

    const mensal = anos.flatMap((a) => Array.from({ length: meses(a) }, (_, i) => ({ a, m: i, d: new Date(Date.UTC(a, i, 1)), v: noMes(a, i) })));
    const picos = anos.map((a) => mensal.filter((p) => p.a === a).reduce((x, y) => (y.v > x.v ? y : x)));
    const rotulos = [...new Set([...picos, mensal.at(-1)!])];

    const acum = (a: number) => { let s = 0; return Array.from({ length: meses(a) }, (_, i) => ({ m: i, v: (s += noMes(a, i)), serie: String(a) })); };
    const curva = [...(anos.includes(ano - 1) ? acum(ano - 1) : []), ...acum(ano)];
    const finais = [String(ano - 1), String(ano)].map((s) => curva.filter((p) => p.serie === s).at(-1)).filter((p): p is NonNullable<typeof p> => !!p);

    const anosBarras = ctx.shell.compacto() ? anos.slice(-3) : anos;
    const anteriores = anosBarras.filter((a) => a !== ano);
    // Mais antigo = verde mais claro; o ano de referência é o único laranja.
    const cor = (a: number) => (a === ano ? C.o500 : VERDE[Math.min(1 + anteriores.indexOf(a), VERDE.length - 1)]!);
    const barras = mensal.filter((p) => anosBarras.includes(p.a)).map((p) => ({ ...p, serie: String(p.a) }));

    corpo.innerHTML = `
      <div class="bmd-kpis2">
        ${kpi({ rotulo: `Vendas · ${r.periodo}`, valor: r.fmtValor(vend), delta: r.delta(vend, vendAnt, BASE_MINIMA), destaque: true })}
        ${kpi({ rotulo: `Volume · ${r.periodo}`, valor: r.fmtTH(vol), delta: r.delta(vol, volAnt) })}
        ${kpi({ rotulo: `Diferença vs ${ano - 1}`, valor: dif == null ? "—" : `${dif >= 0 ? "+" : "−"}${r.fmt(Math.abs(dif))}`, nota: `mesmo período de ${ano - 1}` })}
        ${kpi({ rotulo: "Ticket médio", valor: fmtTicket(tk), delta: r.delta(tk, tkAnt) })}
      </div>
      ${cartao("Vendas mês a mês", `${anos[0]} → ${r.periodo}`, '<div data-el="mensal"></div>')}
      <div class="bmd-grid2">
        ${cartao("Acumulado no ano", `${ano} contra ${ano - 1}`, '<div data-el="acum"></div>')}
        ${cartao("Mês × ano", "ano de referência em laranja", `<div class="bmd-leg2">${legenda(anosBarras.map((a) => ({ rotulo: String(a), cor: cor(a), quadrado: true })))}</div><div data-el="mesano"></div>`)}
      </div>`;

    const alto = ctx.shell.compacto() ? 200 : 240;
    const tick = (v: number) => (v === 0 ? "0" : r.fmt(v));
    ctx.shell.desenhar("mensal", {
      height: alto, marginLeft: 80, marginRight: 24,
      x: { type: "utc", label: null },
      y: { grid: true, label: null, tickFormat: tick },
      marks: [
        Plot.ruleY([0], { stroke: C.border }),
        Plot.lineY(mensal, { x: "d", y: "v", stroke: C.o500, strokeWidth: 2, curve: "monotone-x" }),
        Plot.dot(rotulos, { x: "d", y: "v", fill: C.o500, r: 3 }),
        Plot.text(rotulos, { x: "d", y: "v", text: (p: { v: number }) => r.fmt(p.v), dy: -9, fill: C.ink, fontWeight: 600 }),
      ],
    });
    ctx.shell.desenhar("acum", {
      height: alto, marginLeft: 80, marginRight: 110,
      x: { domain: [0, 11], ticks: 12, tickFormat: (i: number) => MESES[i] ?? "", label: null },
      y: { grid: true, label: null, tickFormat: tick },
      color: { domain: [String(ano - 1), String(ano)], range: [C.anterior, C.o500] },
      marks: [
        Plot.lineY(curva, { x: "m", y: "v", stroke: "serie", strokeWidth: 2.4, curve: "monotone-x" }),
        Plot.dot(finais, { x: "m", y: "v", fill: "serie", r: 3.5 }),
        Plot.text(finais, { x: "m", y: "v", text: (p: { serie: string; v: number }) => `${p.serie}  ${r.fmt(p.v)}`, dx: 8, textAnchor: "start", fill: "serie", fontWeight: 700 }),
      ],
    });
    ctx.shell.desenhar("mesano", {
      height: alto, marginLeft: 70, marginBottom: 28,
      fx: { axis: "bottom", tickFormat: (i: number) => MESES[i] ?? "", label: null, padding: 0.12 },
      x: { axis: null, domain: anosBarras.map(String) },
      y: { grid: true, label: null, tickFormat: tick },
      color: { domain: anosBarras.map(String), range: anosBarras.map(cor) },
      marks: [
        Plot.ruleY([0], { stroke: C.border }),
        Plot.barY(barras, { fx: "m", x: "serie", y: "v", fill: "serie", title: (p: { m: number; a: number; v: number }) => `${MESES[p.m]} ${p.a}: ${r.fmt(p.v)}` }),
      ],
    });
  },
};
```

- [ ] **Step 4: Painel, preview e página**

Em `web/basf/src/paineis.ts`, acrescente o import e o painel:

```ts
import { evolucao } from "./abas/sales/evolucao";

export const SALES: Painel = { titulo: "Vendas", abas: [evolucao] };
```

`web/basf/src/preview-sales.ts`:

```ts
/** Entrypoint do preview do Sales. No portal: componente Aurelia próprio chamando montarDashboard com SALES. */
import { carregarArquivo } from "./carregar";
import { montarDashboard } from "./dashboard";
import { SALES } from "./paineis";

montarDashboard(document.getElementById("app")!, carregarArquivo("dados/"), SALES);
```

`web/basf/sales.html`:

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BASF | Nunhems · Vendas</title>
<link rel="stylesheet" href="src/shared/estilo.css">
<link rel="stylesheet" href="src/dashboard.css">
<style>body { margin: 0; background: #FBF7F1; }</style>
</head>
<body>
  <div id="app"></div>
  <script src="dist/preview-sales.js"></script>
</body>
</html>
```

Em `package.json`, ao lado de `"dash:basf"`:

```json
    "dash:basf:sales": "bun build web/basf/src/preview-sales.ts --outdir web/basf/dist --target browser --minify",
```

Em `web/basf/README.md`, no bloco de comandos, depois de `bun run dash:basf`:

```
bun run dash:basf:sales      # bundle do preview do Sales (http://localhost:4173/sales.html)
```

E no fim da lista "Decisões que não são óbvias":

```markdown
- **Sales** (`sales.html`, spec `2026-10-02-basf-sales-design.md`): mesmo `montarDashboard` com o painel `SALES`. Lê o mesmo `vendas` do BI Mercado; o RTV já vem com a carteira do PBI Sales (BR10→BR02 em 3 clientes no WMW, BR04/BR07 como "(ex-RTV)"). As 3 abas compartilham filtros.
```

- [ ] **Step 5: Build e tipos**

Run: `bunx tsc --noEmit -p . && bun test web/basf && bun run dash:basf && bun run dash:basf:sales`
Expected: tudo verde, e `web/basf/dist/preview-sales.js` gerado.

- [ ] **Step 6: Screenshot**

Com o `dash:basf:serve` no ar, tire screenshots de `http://localhost:4173/sales.html#evolucao` em 640, 1024 e 1500px e leia os 3 PNGs. Confira:
- O KPI "Vendas · 2026 até jun" mostra R$ 29,0 mi.
- O volume mostra 785 mil TH.
- A diferença é negativa.
- O ticket fica perto de R$ 37/TH.
- A linha mensal vai de jan/2022 a jun/2026, com o pico de jun/2026 rotulado.
- O acumulado tem as duas curvas.
- O mês × ano tem 12 facetas, 2026 em laranja e, em 640px, só 3 anos.
- Nenhum texto cortado.
- `#evolucao?medida=th`: a linha e as barras passam para TH.
- `#evolucao?moeda=eur`: os valores ficam em € e o ticket em €/TH.

- [ ] **Step 7: Commit**

```bash
git add web/basf/src/abas/sales web/basf/src/paineis.ts web/basf/src/preview-sales.ts web/basf/sales.html web/basf/src/componentes.ts package.json web/basf/README.md
git commit -m "feat(basf-sales): painel Sales com a aba Evolucao"
```

---

### Task 7: Aba Análise (+ `pareado` compartilhado com a aba Vendas)

**Files:**
- Modify: `web/basf/src/componentes.ts` (+ `pareado`)
- Modify: `web/basf/src/abas/vendas.ts` (usa `pareado`)
- Create: `web/basf/src/abas/sales/analise.ts`
- Modify: `web/basf/src/paineis.ts`
- Modify: `web/basf/src/dashboard.css`

- [ ] **Step 1: `pareado` em `componentes.ts`**

Acrescente `variacao` ao import de `./calc`, que hoje é só `import type { Grupo }`: troque por `import { variacao, type Grupo } from "./calc";`. Depois, no fim do arquivo:

```ts
/** Barras pareadas atual × anterior com variação (abas Vendas e Análise). Clique filtra por `dim`. */
export function pareado(itens: { chave: string; atual: number; anterior: number | null }[], dim: string, fmt: (v: number) => string, baseMinima = 0): string {
  if (!itens.length) return '<p class="bmd-nota">Sem venda no período.</p>';
  const max = Math.max(...itens.flatMap((i) => [i.atual, i.anterior ?? 0]), 1);
  const w = (v: number | null) => ((Math.max(0, v ?? 0) / max) * 100).toFixed(1);
  return `<div class="bmd-par2">${itens.map((i) => {
    const v = variacao(i.atual, i.anterior, baseMinima);
    return `<button type="button" data-filtro="${dim}" data-v="${esc(i.chave)}"><span title="${esc(i.chave)}">${esc(i.chave)}</span>
      <span><s style="width:${w(i.atual)}%;background:${C.o500}"></s><s style="width:${w(i.anterior)}%;background:${C.anterior}"></s></span>
      <span class="bmd-mono">${esc(fmt(i.atual))} <em class="${v != null && v < 0 ? "bmd-neg" : "bmd-pos"}">${deltaPct(v)}</em></span></button>`;
  }).join("")}</div>`;
}
```

- [ ] **Step 2: A aba Vendas passa a usar `pareado`**

Em `web/basf/src/abas/vendas.ts`:
- No import de `../componentes`, acrescente `pareado`.
- Substitua a `const pareado = (dim: string) => { ... };` inteira, que hoje monta o HTML na mão, por:

```ts
    const parear = (dim: string) => {
      const ant = new Map(agregar(recorte(ano - 1, mesCorte), {}, dim, campo).map((g) => [g.chave, conv(g.valor, ano - 1)]));
      return pareado(agregar(recorte(ano, mesCorte), {}, dim, campo).slice(0, 6)
        .map((g) => ({ chave: g.chave, atual: conv(g.valor, ano) ?? 0, anterior: ant.get(g.chave) ?? null })), dim, (v) => fmt(v), baseMinima);
    };
```

- Troque `pareado("crop")` e `pareado("rtv")` no template por `parear("crop")` e `parear("rtv")`.
- Se o `tsc` acusar import sem uso (`esc`, `C`), remova-o.

- [ ] **Step 3: `abas/sales/analise.ts`**

```ts
import { distintos, total } from "../../calc";
import { cartao, kpi, pareado } from "../../componentes";
import { n0 } from "../../shared/formato";
import type { DefAba } from "../tipos";
import { BASE_MINIMA, DIMS, controlesBase, pares, ranking, recorte, semResultado } from "./comum";

const deltaAbs = (a: number, b: number, ano: number) => ({ txt: `${a - b >= 0 ? "+" : "−"}${n0(Math.abs(a - b))} vs ${ano}`, ruim: a < b });

export const analise: DefAba = {
  id: "analise",
  rotulo: "Análise",
  recursos: () => ["vendas", "meta"],
  chips: () => ({ dims: DIMS, origem: "vendas" }),
  controles: controlesBase,

  render(ctx, corpo) {
    const r = recorte(ctx);
    if (!r.base.length) return semResultado(ctx, corpo);
    const { ano } = r;
    const atual = r.ytd(ano), ant = r.ytd(ano - 1);
    const vend = r.moeda(total(atual, "valor"), ano), vendAnt = r.moeda(total(ant, "valor"), ano - 1);
    const vol = total(atual, "th"), volAnt = total(ant, "th");
    const cli = distintos(atual, "cliente"), cliAnt = distintos(ant, "cliente");
    const vars = distintos(atual, "variedade"), varsAnt = distintos(ant, "variedade");
    const ativos = (dim: string) => ctx.estado.filtros[ctx.estado.aba][dim] ?? [];
    const sub = `${ano} × ${ano - 1}, mesmo período`;

    corpo.innerHTML = `
      <div class="bmd-kpis2">
        ${kpi({ rotulo: `Volume · ${r.periodo}`, valor: r.fmtTH(vol), delta: r.delta(vol, volAnt), destaque: true })}
        ${kpi({ rotulo: `Vendas · ${r.periodo}`, valor: r.fmtValor(vend), delta: r.delta(vend, vendAnt, BASE_MINIMA) })}
        ${kpi({ rotulo: "Clientes com compra", valor: n0(cli), delta: deltaAbs(cli, cliAnt, ano - 1) })}
        ${kpi({ rotulo: "Variedades vendidas", valor: n0(vars), delta: deltaAbs(vars, varsAnt, ano - 1) })}
      </div>
      <div class="bmd-grid2">
        ${cartao(`Por crop · ${r.periodo}`, `Δ vs ${ano - 1}`, ranking(pares(r, "crop", 12), "crop", r, ativos("crop")))}
        ${cartao(`Por RTV · ${r.periodo}`, `Δ vs ${ano - 1}`, ranking(pares(r, "rtv", 12), "rtv", r, ativos("rtv")))}
      </div>
      <div class="bmd-grid2">
        ${cartao("Por cliente · top 15", `${sub} · lista completa na aba Tabela`, pareado(pares(r, "cliente", 15), "cliente", r.fmt, r.minimo))}
        ${cartao("Por variedade · top 15", sub, pareado(pares(r, "variedade", 15), "variedade", r.fmt, r.minimo))}
      </div>`;
  },
};
```

- [ ] **Step 4: Painel e CSS**

Em `web/basf/src/paineis.ts`: `import { analise } from "./abas/sales/analise";` e `abas: [evolucao, analise]`.

No fim de `web/basf/src/dashboard.css`:

```css
/* Sales: ranking com Δ ao lado do valor. */
.bmd-bl--delta .bmd-bl__i { grid-template-columns: minmax(90px, 160px) 1fr 140px; }
.bmd-bl__v em { font-style: normal; margin-left: 6px; }
```

- [ ] **Step 5: Verificar**

Run: `bunx tsc --noEmit -p . && bun test web/basf && bun run dash:basf && bun run dash:basf:sales`
Expected: verde.

Faça os screenshots e leia os PNGs:
- `sales.html#analise` em 640, 1024 e 1500px.
  - WMW lidera o ranking por crop.
  - O RTV mostra os nomes, e o "(ex-RTV)" só aparece se tiver venda no período.
  - Nas pareadas, o laranja (atual) fica sobre o bege (anterior).
  - Os rótulos longos de cliente terminam em reticências.
- `index.html#vendas` em 1024px: as barras "Por crop" e "Por RTV" ficam iguais às de antes (regressão do `pareado`).
- Clique é coberto pelo `data-filtro` delegado: `sales.html#analise?f.crop=MEM` tem que mostrar o chip "Crop: MEM" e só MEM nos rankings.

- [ ] **Step 6: Commit**

```bash
git add web/basf/src/componentes.ts web/basf/src/abas/vendas.ts web/basf/src/abas/sales/analise.ts web/basf/src/paineis.ts web/basf/src/dashboard.css
git commit -m "feat(basf-sales): aba Analise e barras pareadas compartilhadas com Vendas"
```

---

### Task 8: Aba Tabela

**Files:**
- Create: `web/basf/src/abas/sales/tabela.ts`
- Modify: `web/basf/src/paineis.ts`
- Modify: `web/basf/src/dashboard.css`

- [ ] **Step 1: `abas/sales/tabela.ts`**

```ts
import { ordenarAnos, tabelaAnos, type LinhaAnos } from "../../calc";
import { deltaPct, seg } from "../../componentes";
import { busca, normalizar } from "../../shared/filtros";
import { esc, n0 } from "../../shared/formato";
import { ICONE } from "../../shared/icones";
import type { DefAba } from "../tipos";
import { DIMS, MESES, controlesBase, recorte, semResultado } from "./comum";

export const tabela: DefAba = {
  id: "tabela",
  rotulo: "Tabela",
  recursos: () => ["vendas", "meta"],
  chips: () => ({ dims: DIMS, origem: "vendas" }),
  controles: (e, d) => seg("tabela", { variedade: "Variedade", cliente: "Cliente" }, e.tabela) + controlesBase(e, d),

  render(ctx, corpo) {
    const r = recorte(ctx);
    if (!r.base.length) return semResultado(ctx, corpo);
    const e = ctx.estado;
    const porVariedade = e.tabela === "variedade";
    const dim = porVariedade ? "variedade" : "cliente";

    // Busca vive no DOM (como em Clientes-chave). Trocar de modo zera: termo de cliente não acha variedade.
    const antigo = corpo.querySelector<HTMLInputElement>(".bmd-busca");
    const mesmoModo = corpo.dataset.modo === e.tabela;
    const buscaAtual = mesmoModo ? antigo?.value ?? "" : "";
    const tinhaFoco = mesmoModo && antigo != null && antigo === document.activeElement;
    const caret = antigo?.selectionStart ?? buscaAtual.length;
    const termo = normalizar(buscaAtual.trim());
    const ls = termo ? r.base.filter((l) => normalizar(String(l[dim] ?? "")).includes(termo)) : r.base;

    const t = tabelaAnos(ls, dim, porVariedade ? "crop" : null, r.ano, r.mesCorte, r.campo, r.conv, r.minimo);
    const { col, desc } = e.ordem;
    const unidade = r.campo === "th" ? "TH" : r.eur ? "€" : "R$";
    const cab = [String(r.ano - 2), String(r.ano - 1), r.periodo, `Var. vs ${r.ano - 1}${r.mesCorte < 12 ? ` até ${MESES[r.mesCorte - 1]}` : ""}`];
    const th = (rot: string, i: number, cls = "n") =>
      `<th class="${cls}"><button type="button" class="bmd-ord${col === i ? " is-on" : ""}" data-ordem="${i}">${esc(rot)}${col === i ? (desc ? " ↓" : " ↑") : ""}</button></th>`;
    const cel = (l: LinhaAnos) => l.v.map((v) => `<td class="n bmd-mono">${v == null ? "" : n0(v)}</td>`).join("") +
      `<td class="n bmd-mono ${l.variacao != null && l.variacao < 0 ? "bmd-neg" : "bmd-pos"}">${deltaPct(l.variacao)}</td>`;
    const item = (l: LinhaAnos, recuo: boolean) => `<tr><td${recuo ? ' class="bmd-ind"' : ""} title="${esc(l.chave)}">${esc(l.chave)}</td>${cel(l)}</tr>`;

    const corpoTabela = ordenarAnos(t.grupos, col, desc).map((g) => {
      if (!porVariedade) return ordenarAnos(g.itens, col, desc).map((l) => item(l, false)).join("");
      const fechado = e.recolhidos.includes(g.chave);
      return `<tr class="bmd-grp bmd-grp--clic" data-recolher="${esc(g.chave)}"><td>${fechado ? ICONE.abrir : ICONE.aberto} ${esc(g.chave)} · ${g.itens.length}</td>${cel(g)}</tr>` +
        (fechado ? "" : ordenarAnos(g.itens, col, desc).map((l) => item(l, true)).join(""));
    }).join("");

    corpo.dataset.modo = e.tabela;
    corpo.innerHTML = `
      <div class="bmd-card bmd-tabela">
        <div class="bmd-tabela__topo" data-el="busca"></div>
        <table class="bmd-tb2 bmd-tb2--anos"><thead><tr>${th(`${porVariedade ? "Variedade" : "Cliente"} · ${unidade}`, -1, "")}${cab.map((c, i) => th(c, i)).join("")}</tr></thead>
        <tbody>${corpoTabela || '<tr><td colspan="5" class="bmd-nota">Nada encontrado para esta busca.</td></tr>'}</tbody>
        <tfoot><tr class="bmd-tot"><td>Total</td>${cel(t.total)}</tr></tfoot></table>
      </div>`;

    corpo.querySelectorAll<HTMLElement>("[data-ordem]").forEach((b) => b.addEventListener("click", () => {
      const c = Number(b.dataset.ordem);
      ctx.mudar((s) => ({ ...s, ordem: { col: c, desc: s.ordem.col === c ? !s.ordem.desc : c !== -1 } }));
    }));
    corpo.querySelectorAll<HTMLElement>("[data-recolher]").forEach((tr) => tr.addEventListener("click", () => {
      const g = tr.dataset.recolher!;
      ctx.mudar((s) => ({ ...s, recolhidos: s.recolhidos.includes(g) ? s.recolhidos.filter((x) => x !== g) : [...s.recolhidos, g] }));
    }));

    const opcoes = [...new Set(r.base.map((l) => String(l[dim] ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const campo = busca(porVariedade ? "Buscar variedade" : "Buscar cliente", opcoes, () => ctx.mudar((s) => ({ ...s })));
    ctx.shell.el("busca").append(campo.el);
    const input = campo.el.querySelector<HTMLInputElement>("input")!;
    input.value = buscaAtual;
    if (tinhaFoco) {
      input.focus();
      input.setSelectionRange(caret, caret);
      // o focus reabre a lista de sugestões; Esc fecha sem limpar o texto
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }
  },
};
```

- [ ] **Step 2: Painel e CSS**

Em `web/basf/src/paineis.ts`: `import { tabela } from "./abas/sales/tabela";` e `abas: [evolucao, analise, tabela]`.

Em `web/basf/src/dashboard.css`:
- Na regra da linha ~128, que esconde as colunas 2, 4 e 5 da tabela de Clientes-chave em tela estreita, troque o seletor `.bmd-tabela > .bmd-tb2 >` por `.bmd-tabela > .bmd-tb2:not(.bmd-tb2--anos) >`. Sem isso, a Tabela do Sales perderia o YTD e a variação no celular.
- No fim do arquivo:

```css
/* Sales · Tabela */
.bmd-tb2--anos td:first-child { max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bmd-tb2--anos .bmd-ind { padding-left: 30px; }
.bmd-ord { all: unset; cursor: pointer; }
.bmd-ord.is-on { color: var(--ink); }
.bmd-grp--clic { cursor: pointer; }
.bmd-grp--clic svg { width: 14px; height: 14px; vertical-align: -2px; }
.bmd-tot td { font-weight: 800; border-top: 2px solid var(--ink); border-bottom: 0; }
@media (max-width: 760px) { .bmd-tb2--anos :is(th, td):nth-child(2) { display: none; } .bmd-tb2--anos td:first-child { max-width: 160px; } }
```

- [ ] **Step 3: Verificar**

Run: `bunx tsc --noEmit -p . && bun test web/basf && bun run dash:basf:sales`
Expected: verde.

Faça os screenshots e leia os PNGs:
- `sales.html#tabela` em 640, 1024 e 1500px.
  - Os grupos de crop com subtotal; a soma do subtotal de CAC bate com as variedades.
  - Colunas 2024, 2025, "2026 até jun" e "Var. vs 2025 até jun".
  - A linha Total da coluna YTD em R$ 29.022.009.
  - Células vazias onde não houve venda.
  - Em 640px, sem a coluna 2024.
- `sales.html#tabela?tab=cliente`: lista plana, com o maior YTD no topo.

No navegador, em http://localhost:4173/sales.html#tabela, confira à mão:
- clicar num cabeçalho ordena e clicar de novo inverte;
- clicar no grupo recolhe;
- a busca filtra enquanto você digita, sem perder o foco;
- trocar para Cliente zera a busca.

- [ ] **Step 4: Commit**

```bash
git add web/basf/src/abas/sales/tabela.ts web/basf/src/paineis.ts web/basf/src/dashboard.css
git commit -m "feat(basf-sales): aba Tabela por variedade e cliente"
```

---

### Task 9: Verificação final

**Files:** nenhum, a não ser que a verificação ache defeito. Nesse caso, corrija na task certa e faça um commit `fix(basf-sales): ...`.

- [ ] **Step 1: Tudo verde**

Run: `bun test && bunx tsc --noEmit -p . && bun run dash:basf && bun run dash:basf:sales && bun run web/basf/snapshot/conferir.ts`
Expected: todos os testes do repo passando (não só `web/basf`), tsc limpo, os dois bundles e todas as âncoras `ok`.

- [ ] **Step 2: Matriz de screenshots**

Com o servidor no ar, em 640, 1024 e 1500px:
- `sales.html#evolucao`, `sales.html#analise`, `sales.html#tabela`;
- `index.html#mercado`, `#comparativo`, `#clientes`, `#vendas`, só em 1024 (regressão).

Leia cada PNG. Procure:
- texto cortado ou sobreposto;
- gráfico sem largura (bloco vazio);
- `NaN` ou `undefined` na tela;
- erro no console (`--enable-logging=stderr --v=0`, procurar `Uncaught`).

- [ ] **Step 3: Casos de borda na mão**

- `sales.html#evolucao?f.cliente=NAO%20EXISTE`: estado vazio, com o botão do filtro e "Limpar filtros", e os dois funcionam.
- `sales.html#evolucao?f.ano=2025`: o ano fechado mostra o período "2025" (sem "até") e o acumulado com as 12 posições.
- `sales.html#analise?moeda=eur&f.ano=2023`: € ativo, porque 2023 tem taxa.
- Trocar de aba mantém os chips.

- [ ] **Step 4: Relatório ao usuário**

Reporte:
- o que passou, com a saída dos comandos;
- os PNGs lidos;
- os desvios da spec listados no topo deste plano;
- as pendências da spec §7.

Peça o OK visual no navegador (`bun run dash:basf:serve` → http://localhost:4173/sales.html). **Não** declare pronto antes do OK.
