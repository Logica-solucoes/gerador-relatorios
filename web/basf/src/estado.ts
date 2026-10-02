import type { Filtros } from "./calc";
import { FONTES, ITENS_CEPEA } from "./fontes";
import type { Aba, Fonte } from "./types";

export interface Estado {
  aba: Aba;
  fonte: Fonte;
  filtros: Record<Aba, Filtros>;
  metrica: string;
  moeda: "brl" | "eur";
  medida: "valor" | "th";
  agrupar: "hotspot" | "rtv" | "crop";
  itemCepea: string;
  /** Mês de corte do YTD em Vendas; null = automático (mês da última venda no ano corrente, 12 em ano fechado). */
  mesCorte: number | null;
  /** Dimensão ativa do ranking da aba Mercado. */
  dim: string;
  /** Caminho do drill do ranking (fora do hash: é navegação, não visão). */
  drill: string[];
  /** Cliente com a ficha aberta (fora do hash). */
  clienteAberto: string | null;
  /** Aba Tabela do Sales: linhas por variedade (agrupadas por crop) ou por cliente. */
  tabela: "variedade" | "cliente";
  /** Ordenação da Tabela (fora do hash): coluna de `ordenarAnos` e sentido. */
  ordem: { col: number; desc: boolean };
  /** Crops recolhidos na Tabela (fora do hash). */
  recolhidos: string[];
}

export const ABAS_MERCADO: Aba[] = ["mercado", "comparativo", "clientes", "vendas"];
export const ABAS_SALES: Aba[] = ["evolucao", "analise", "tabela"];
const ABAS: Aba[] = [...ABAS_MERCADO, ...ABAS_SALES];
const COMPARTILHA_ANO: Aba[] = ["mercado", "comparativo"];
const COM_CORTE: Aba[] = ["vendas", ...ABAS_SALES];

export function inicial(aba: Aba = "mercado"): Estado {
  return {
    aba, fonte: "basf",
    filtros: Object.fromEntries(ABAS.map((a) => [a, {}])) as Record<Aba, Filtros>,
    metrica: "area", moeda: "brl", medida: "valor", agrupar: "hotspot", itemCepea: "Área Cepea", mesCorte: null, dim: "uf",
    drill: [], clienteAberto: null, tabela: "variedade", ordem: { col: 2, desc: true }, recolhidos: [],
  };
}

const copiar = (e: Estado): Estado => ({
  ...e,
  filtros: Object.fromEntries(ABAS.map((a) => [a, { ...e.filtros[a] }])) as Record<Aba, Filtros>,
  drill: [...e.drill],
  recolhidos: [...e.recolhidos],
});

export function definirFiltro(e: Estado, dim: string, valores: string[]): Estado {
  const n = copiar(e);
  // Sales: as 3 abas são vistas do mesmo recorte. Mercado/Comparativo: só o ano anda junto.
  const alvos = ABAS_SALES.includes(e.aba) ? ABAS_SALES : dim === "ano" && COMPARTILHA_ANO.includes(e.aba) ? COMPARTILHA_ANO : [e.aba];
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
  if (e.fonte === "cepea") p.set("item", e.itemCepea);
  if (COM_CORTE.includes(e.aba) && e.mesCorte != null) p.set("corte", String(e.mesCorte));
  if (e.aba === "tabela") p.set("tab", e.tabela);
  for (const [dim, vals] of Object.entries(e.filtros[e.aba])) for (const v of vals) p.append(`f.${dim}`, v);
  return `#${e.aba}?${p}`;
}

export function deHash(hash: string, abas: Aba[] = ABAS_MERCADO): Estado {
  const e = inicial(abas[0]);
  const [abaTxt = "", query = ""] = hash.replace(/^#/, "").split("?");
  if (!abas.includes(abaTxt as Aba)) return e;
  e.aba = abaTxt as Aba;
  const p = new URLSearchParams(query);
  const fonte = p.get("fonte");
  let n = fonte && fonte in FONTES ? trocarFonte(e, fonte as Fonte).estado : e;
  const def = FONTES[n.fonte];
  const m = p.get("m");
  if (m && m in def.metricas) n.metrica = m;
  n.moeda = p.get("moeda") === "eur" ? "eur" : "brl";
  n.medida = p.get("medida") === "th" ? "th" : "valor";
  const ag = p.get("agrupar");
  if (ag === "hotspot" || ag === "rtv" || ag === "crop") n.agrupar = ag;
  const item = p.get("item");
  if (item && Object.hasOwn(ITENS_CEPEA, item)) n.itemCepea = item;
  const corte = Number(p.get("corte") || NaN);
  if (Number.isInteger(corte) && corte >= 1 && corte <= 12) n.mesCorte = corte;
  if (p.get("tab") === "cliente") n.tabela = "cliente";
  const dim = p.get("dim");
  if (dim && def.rankings.includes(dim)) n.dim = dim;
  const dims = new Set([...p.keys()].filter((k) => k.startsWith("f.")));
  for (const k of dims) {
    const dimFiltro = k.slice(2);
    if (e.aba === "mercado" && !(dimFiltro in def.dims)) continue;
    n = definirFiltro(n, dimFiltro, p.getAll(k).filter(Boolean));
  }
  return n;
}
