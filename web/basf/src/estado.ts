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
  const def = FONTES[n.fonte];
  const m = p.get("m");
  if (m && m in def.metricas) n.metrica = m;
  n.moeda = p.get("moeda") === "eur" ? "eur" : "brl";
  n.medida = p.get("medida") === "th" ? "th" : "valor";
  const ag = p.get("agrupar");
  if (ag === "hotspot" || ag === "rtv" || ag === "crop") n.agrupar = ag;
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
