/**
 * Blocos de HTML dos dashboards BFM.
 *
 * Tudo aqui é função de dados → string. Nada lê estado de dashboard nenhum,
 * e é por isso que mora fora dos closures: dá para ler cada bloco isolado.
 *
 * Todo texto vindo da API passa por `esc` ANTES de entrar em `innerHTML`.
 */

import { max, min, quantile } from "d3-array";
import { esc, med, nf } from "./formato";

/** Variação mês a mês exibida sob o número do KPI. */
export interface Delta {
  txt: string;
  /** Variação na direção ruim do indicador — o CSS pinta em laranja. */
  pior: boolean;
}

export interface CardKpi {
  /** Chave estável usada em `EstadoDash.kpis`. NÃO é o texto da tela: o PDF lê
   *  por aqui, então renomear o rótulo visível não pode quebrar o relatório. */
  id: string;
  rotulo: string;
  /** Já formatado. Use `—` quando não houver dado; nunca "NaN" nem string vazia. */
  valor: string;
  /** Sufixo curto ao lado do valor ("h", "dias", "t"). Omita quando o valor já for adimensional. */
  unidade?: string;
  /** Linha auxiliar sob o número (faixa, base de cálculo). Opcional. */
  nota?: string;
  delta?: Delta;
  /** Valores brutos ordenados: desenha a mini faixa min–mediana–max sob o card. Omita quando não fizer sentido (ex.: contagens). */
  vals?: number[];
  /** Valor por extenso quando `valor` vem abreviado ("R$ 23,9 mi"). Vira o
   *  `title` do número na tela, e é ELE que entra em `EstadoDash.kpis` — PDF e
   *  XLSX não podem herdar uma abreviação que existe só porque a coluna da tela
   *  é estreita. */
  exato?: string;
  /** Cor da mini faixa min–mediana–max, hex de `shared/tema.ts`. Serve SÓ para
   *  isso: o filete colorido no topo do card saiu junto com o card (ver
   *  `.bmd-kpis` em shared/estilo.css). Sem `vals`, `acento` não pinta nada. */
  acento?: string;
}

/** Mini box plot inline exibido sob o card, quando `CardKpi.vals` vem preenchido. */
function faixa(vals: number[], cor: string): string {
  if (vals.length < 3) return "";

  const w = 160, h = 14;
  const lo = min(vals)!, hi = max(vals)!;
  const mediana = med(vals);
  const x = (v: number) => (hi === lo ? w / 2 : 4 + ((v - lo) / (hi - lo)) * (w - 8));
  const q1 = x(quantile(vals, 0.25)!), q3 = x(quantile(vals, 0.75)!), m = x(mediana);

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"
      aria-label="Faixa de ${nf(lo, 2)} a ${nf(hi, 2)}, mediana ${nf(mediana, 2)}">
      <line x1="4" x2="${w - 4}" y1="${h / 2}" y2="${h / 2}" stroke="${cor}" stroke-opacity=".3" stroke-width="1.5" stroke-linecap="round"/>
      <rect x="${q1}" y="${h / 2 - 3.5}" width="${Math.max(q3 - q1, 1.5)}" height="7" rx="1.5" fill="${cor}" opacity=".55"/>
      <line x1="${m}" x2="${m}" y1="1" y2="${h - 1}" stroke="${cor}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

/** Um card da faixa de KPIs do hero. */
export function kpi(c: CardKpi): string {
  const deltaHtml = c.delta
    ? `<span class="bmd-delta${c.delta.pior ? " bmd-delta--pior" : ""}">${esc(c.delta.txt)}</span>`
    : "";
  const unidadeHtml = c.unidade ? `<small> ${esc(c.unidade)}</small>` : "";
  // Title só quando o exato DIFERE do que está na tela. Quem monta o card passa
  // `exato` sempre; a decisão de mostrar mora aqui, num lugar só, porque o
  // chamador não sabe se `moedaCompacta` abreviou ou não naquele recorte. Um
  // tooltip que repete o texto visível é ruído, e no leitor de tela vira leitura
  // dobrada do mesmo número.
  const tituloHtml = c.exato && c.exato !== c.valor ? ` title="${esc(c.exato)}"` : "";

  return `<div class="bmd-kpi">
      <div class="bmd-kpi__k">${esc(c.rotulo)}</div>
      <div class="bmd-kpi__v">
        <span${tituloHtml}>${esc(c.valor)}${unidadeHtml}</span>
        ${deltaHtml}
      </div>
      <div class="bmd-kpi__sub">${esc(c.nota ?? "")}</div>
      ${c.vals ? faixa(c.vals, c.acento ?? "#2C4870") : ""}
    </div>`;
}

/** Estado vazio que ensina: diz o que aconteceu e o que fazer a seguir.
 *  `texto` aceita `<b>` — é escrito por nós, não vem da API. */
export function estadoVazio(titulo: string, texto: string): string {
  return `<div class="bmd-empty"><strong>${esc(titulo)}</strong><p>${texto}</p></div>`;
}

export interface ItemLegenda {
  rotulo: string;
  /** Bolinha/quadrado da cor da série. Omita quando for `tracejado`. */
  cor?: string;
  /** Régua tracejada (mediana, meta). */
  tracejado?: boolean;
  /** Quadrado em vez de bolinha — usado quando a série é barra, não ponto. */
  quadrado?: boolean;
}

export function legenda(itens: ItemLegenda[]): string {
  return itens
    .map((i) => {
      if (i.tracejado) return `<span><i class="dash"></i>${esc(i.rotulo)}</span>`;
      const classe = i.quadrado ? ' class="sq"' : "";
      return `<span><i${classe} style="background:${i.cor}"></i>${esc(i.rotulo)}</span>`;
    })
    .join("");
}

/** Etiqueta de categoria na tabela. `variante` vira a classe `bmd-chip--<variante>`. */
export function chip(texto: string, variante: string): string {
  return `<span class="bmd-chip bmd-chip--${variante}">${esc(texto)}</span>`;
}

/** Linha única ocupando a tabela inteira quando o recorte não tem registro. */
export function linhaSemDados(colunas: number, texto: string): string {
  return `<tr><td colspan="${colunas}" class="bmd-dim">${esc(texto)}</td></tr>`;
}
