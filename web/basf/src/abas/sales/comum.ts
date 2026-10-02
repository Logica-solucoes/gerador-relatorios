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
