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

/** Último mês com venda no ano: o corrente vai até a data da última venda, ano fechado vai a dezembro. */
export const mesMaximo = (ano: number, ultima: string) => (ano === Number(ultima.slice(0, 4)) ? Number(ultima.slice(5, 7)) : 12);

export const mesDeCorte = (pedido: number | null, ano: number, ultima: string) => Math.min(pedido ?? 12, mesMaximo(ano, ultima));

/** No mês da última venda o corte vai até o dia dela: o ano anterior compara até o mesmo dia, como o PBI. */
export const diaDeCorte = (mes: number, ano: number, ultima: string) =>
  ano === Number(ultima.slice(0, 4)) && mes === Number(ultima.slice(5, 7)) ? Number(ultima.slice(8, 10)) : 31;

/** Linha sem `dia` (snapshot antigo) conta o mês inteiro. */
export const ateCorte = (l: Linha, mes: number, dia = 31) => {
  const m = l.mes as number;
  return m < mes || (m === mes && Number(l.dia ?? 0) <= dia);
};

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
export function tabelaAnos(ls: Linha[], dim: string, grupo: string | null, ano: number, mesCorte: number, metrica: string, conv: Conv = (v) => v, baseMinima = 0, diaCorte = 31): { grupos: GrupoAnos[]; total: LinhaAnos } {
  const doRecorte = ls.filter((l) => {
    const a = l.ano as number;
    return (a === ano - 2 || a === ano - 1 || a === ano) && (a !== ano || ateCorte(l, mesCorte, diaCorte));
  });
  const linha = (chave: string, xs: Linha[]): LinhaAnos => {
    const doAno = (a: number, mes = 12, dia = 31) => conv(total(xs.filter((l) => l.ano === a && ateCorte(l, mes, dia)), metrica), a);
    const ytd = doAno(ano, mesCorte, diaCorte);
    return { chave, v: [doAno(ano - 2), doAno(ano - 1), ytd], variacao: variacao(ytd, doAno(ano - 1, mesCorte, diaCorte), baseMinima) };
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
