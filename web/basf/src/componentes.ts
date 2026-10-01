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
