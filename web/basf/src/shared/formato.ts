/**
 * Formatação pt-BR compartilhada pelos dashboards BFM.
 * Tudo aqui é função pura de valor → string.
 */

import { median } from "d3-array";

/* ── formatadores Intl reusados ───────────────────────────────────────────────
   `valor.toLocaleString("pt-BR", { ...opções })` CONSTRÓI um formatador Intl a
   cada chamada — é a parte cara, não a formatação em si. A tabela de
   programações chama cinco por linha (peso, valor, solicitação, chegada,
   saída); com 3,2 mil linhas isso media 730 ms de main thread travada POR
   RENDER, e todo filtro, drill ou resize redesenha a tabela inteira. Com as
   instâncias reusadas o mesmo trabalho leva 19 ms — 39x, medido.

   Só instância guardada: as opções e a saída são idênticas às de antes.       */
const FMT_INT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const FMT_TICK = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const FMT_DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** `nf` aceita qualquer número de casas, então o cache é por casas — na prática
 *  são três (0, 1 e 2) e o Map nunca passa disso. */
const FMT_DEC = new Map<number, Intl.NumberFormat>();

function decimal(casas: number): Intl.NumberFormat {
  let f = FMT_DEC.get(casas);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    FMT_DEC.set(casas, f);
  }
  return f;
}

/** Número com casas decimais fixas. `null`/`undefined`/`NaN` viram travessão —
 *  os tipos declarados em `types.ts` prometem `number`, mas a API real já
 *  devolveu campo nulo em produção (ex.: peso de container ainda não pesado). */
export function nf(v: number | null | undefined, casas = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return decimal(casas).format(v);
}

/** Inteiro com separador de milhar. `null`/`undefined`/`NaN` viram travessão —
 *  mesmo motivo de `nf`: o dado real é mais frouxo do que o tipo declarado. */
export function n0(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return FMT_INT.format(v);
}

/** Valor em reais. `null`/`NaN` viram travessão — é o "(sem dados)" do dash antigo. */
export function moeda(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `R$ ${nf(v, 2)}`;
}

/** Valor em reais abreviado para caber num KPI: `R$ 23,9 mi`, `R$ 481 mil`.
 *
 *  Abaixo de mil devolve o valor cheio — "R$ 0,9 mil" não ajuda.
 *
 *  Só para a TELA. O exato continua indo para o `title` do número e para os
 *  relatórios: ver `CardKpi.exato` em shared/blocos.ts. Nunca use esta função
 *  para alimentar `EstadoDash.kpis`. */
export function moedaCompacta(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `R$ ${nf(v / 1e9, 1)} bi`;
  if (abs >= 1e6) return `R$ ${nf(v / 1e6, 1)} mi`;
  if (abs >= 1e3) return `R$ ${nf(v / 1e3, 0)} mil`;
  return moeda(v);
}

/** Plot chama `tickFormat` como `(valor, índice)`. Um formatter com segundo parâmetro
 *  opcional recebe o índice ali e os decimais crescem tick a tick — daí a arrow de
 *  um argumento só. */
export const tickNum = (v: number) => FMT_TICK.format(v);

const FMT_MES_CURTO = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const FMT_MES_LONGO = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** `2026-04` ou `2026-04-17` → primeiro dia do mês em UTC. */
export function inicioDoMes(iso: string): Date {
  return new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
}

/** `2026-04-17` → `abr`. */
export function mesCurto(iso: string): string {
  return FMT_MES_CURTO.format(inicioDoMes(iso)).replace(".", "");
}

/** `2026-04-17` → `abril de 2026`. */
export function mesLongo(iso: string): string {
  return FMT_MES_LONGO.format(inicioDoMes(iso));
}

/**
 * Data ISO → `Date` que o `write-excel-file` grava com a HORA LOCAL.
 *
 * O `convertDateToExcelSerial` da lib é literalmente `date.getTime() / dia`:
 * serial calculado em UTC puro, sem opção de fuso. Uma chegada às 08:30 em
 * GMT-3 saía 11:30 na planilha, e em colunas só-data o recuo ainda podia jogar
 * o registro para o dia anterior. Deslocando o instante pelo offset local, os
 * componentes UTC do `Date` passam a ser os componentes locais — que é o que a
 * lib vai ler. Só para exportação: em qualquer outro uso este `Date` está errado.
 */
export function dataExcel(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
}

/** Data ISO → `17/04/26`. Meio-dia local evita o recuo de fuso virar o dia anterior. */
export function dia(iso: string): string {
  return FMT_DIA.format(new Date(`${iso.slice(0, 10)}T12:00:00`));
}

/** Data-hora ISO → `17/04 08:30`. ICU mais novo junta data e hora com vírgula
 *  ("17/04, 08:30") — removida para o formato ficar estável entre versões do Node. */
export function hora(iso: string): string {
  return FMT_HORA.format(new Date(iso)).replace(",", "");
}

export function horas(v: number): string {
  return `${nf(v, 2)} h`;
}

export function dias(v: number): string {
  return `${nf(v, 1)} ${v >= 2 ? "dias" : "dia"}`;
}

/** Dias abaixo de 1 dizem mais em horas: "0,1 dia" não significa nada para quem opera. */
export function duracao(d: number): string {
  return d < 1 ? `${nf(d * 24, 1)} h` : dias(d);
}

/** Mediana com 0 no lugar de `undefined` — o chamador já garantiu que há dados. */
export function med(vals: number[]): number {
  return median(vals) ?? 0;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/** Escapa antes de qualquer `innerHTML`. Todo dado que vem da API passa por aqui.
 *  Aceita `unknown` pelo mesmo motivo de `n0`/`nf`: `types.ts` promete `string`, mas
 *  a API real devolve nulo em coluna que só passou a ser preenchida depois (nota
 *  fiscal de programação anterior a fev/2026). Nulo vira vazio; qualquer outra
 *  coisa vira texto. Guardar em cada chamada é o que já falhou uma vez. */
export function esc(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/[&<>"]/g, (c) => ESCAPES[c]!);
}

/** Corta com reticências. O rótulo completo continua no tooltip. */
export function truncar(s: string, limite: number): string {
  return s.length > limite ? `${s.slice(0, limite - 1)}…` : s;
}

export function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Chave de agrupamento tolerante a espaço supérfluo (nas pontas ou duplicado
 * no meio) e caixa. Usar SÓ para comparar/agrupar categorias que chegam da API
 * sem normalização própria — nunca para exibir.
 *
 * Duas grafias que renderizam IGUAL ("Itu" e "Itu ") são strings diferentes
 * para um agrupamento por igualdade exata, e viram duas barras/opções
 * idênticas de olho no gráfico e no filtro. O texto bruto continua sendo o
 * que a tabela e o PDF mostram — esta função nunca participa de exibição,
 * só de decidir "é a mesma categoria?".
 */
export function chaveCategoria(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase();
}
