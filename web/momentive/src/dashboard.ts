/**
 * Dashboard de exportação — Momentive / BFM Transportes.
 *
 * Renderiza dentro de um elemento hospedeiro; não toca em nada fora dele. Todo o CSS está
 * escopado sob `.mtv` (ver `dashboard.css`), então convive com o CSS do portal Aurelia.
 *
 *   import { montarDashboard } from "./dashboard";
 *   const dash = montarDashboard(this.elementoRaiz, embarques);
 *   // ao destruir o custom element:
 *   dash.destruir();
 *
 * Gráficos em Observable Plot — a mesma lib do motor de relatórios em PDF, para que a versão
 * web e a impressa não divirjam visualmente.
 */

import * as Plot from "@observablehq/plot";
import { ascending, descending, max, median, min, quantile, rollups, sum } from "d3-array";
import type { Embarque, Etapa, Filtro, Modal } from "./types";

/* ── paleta ──────────────────────────────────────────────────────────────────
   Navy #2C4870 é a marca da BFM e fica preservado como âncora. Laranja é
   semântico, não decorativo: significa "olhe aqui" (outlier ou dado ajustado).
   Contrastes conferidos — nenhum texto abaixo de 4,5:1, e os três tons de
   etapa se separam entre si por >= 3,17 porque são segmentos vizinhos.      */
const C = {
  navy: "#2C4870",
  navy400: "#4D6991",
  lcl: "#7E9ABD",
  accent: "#CC7C2F",
  accentInk: "#9A5817",
  ink: "#111C2E",
  muted: "#55637A",
  border: "#E3E7ED",
  surface: "#FFFFFF",
} as const;

/* Sistema de duas cores: navy é a estrutura, laranja é o contraponto. Antes o
   laranja só marcava alerta e quase não aparecia — o dash ficava monocromático.
   Agora ele é COR DE CATEGORIA: LCL nos gráficos por modal, trânsito no ciclo.
   Os dois nunca convivem no mesmo gráfico (o ciclo é exclusivo de FCL), então
   não há ambiguidade de leitura. */
const COR_MODAL: Record<Modal, string> = { FCL: C.navy, LCL: C.accent };

/* Laranja e azul-claro colidem em LUMINÂNCIA (2,13:1) — é inerente às duas cores,
   nenhum par fecha os 3:1 exigidos para fills adjacentes. O que separa aqui é o
   MATIZ (frio vs. quente) mais a borda branca de 1px entre segmentos, caminho que
   a própria WCAG 1.4.11 admite. Não remova o `stroke` do barX do ciclo achando que
   é enfeite: é ele que sustenta a distinção. */
const ETAPAS: { chave: Etapa; rotulo: string; cor: string; texto: string }[] = [
  { chave: "espera", rotulo: "Espera do container", cor: "#B4C6DA", texto: "#22375A" },
  { chave: "estufagem", rotulo: "Estufagem", cor: "#162438", texto: "#FFFFFF" },
  { chave: "transito", rotulo: "Trânsito ao terminal", cor: C.accent, texto: "#162438" },
];

/** Piso de volume para comparar dois meses. Abaixo disso a mediana é ruído:
 *  julho/2026 tem 4 embarques FCL e produziria uma seta de tendência falsa. */
const MIN_COMPARACAO = 5;

/* ── formatação pt-BR ────────────────────────────────────────────────────── */
const nf = (v: number, d = 1) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const n0 = (v: number) => v.toLocaleString("pt-BR");

/** Plot chama `tickFormat` como `(valor, índice)`. Um formatter com segundo parâmetro
 *  opcional recebe o índice ali e os decimais crescem tick a tick — daí a arrow de
 *  um argumento só. Mesma armadilha documentada no CLAUDE.md da raiz. */
const tickNum = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const _mesCurto = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const _mesLongo = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const mesCurto = (v: Date) => _mesCurto.format(v).replace(".", "");
const mesChave = (iso: string) => mesCurto(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));
const mesLongo = (iso: string) => _mesLongo.format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));

const dia = (s: string) =>
  new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const hora = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const horas = (v: number) => `${nf(v, 2)} h`;
const dias = (v: number) => `${nf(v, 1)} ${v >= 2 ? "dias" : "dia"}`;
/** Dias abaixo de 1 dizem mais em horas: "0,1 dia" não significa nada para quem opera. */
const duracao = (d: number) => (d < 1 ? `${nf(d * 24, 1)} h` : dias(d));
const med = (a: number[]) => median(a) ?? 0;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Usado nos eixos Y em modo compacto: rótulo completo só cabe no tooltip. */
const truncar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const equip = (d: Embarque) =>
  d.modal === "FCL" ? d.tipo ?? "Não informado" : `${d.volumes} ${d.volumes === 1 ? "volume" : "volumes"}`;

const ESTILO_PLOT = {
  style: { fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif", fontSize: "11px", background: "transparent", color: C.muted },
} as const;

const GABARITO = `
<header class="mtv-hero">
  <div class="mtv-hero__inner">
    <div class="mtv-hero__row">
      <div>
        <div class="mtv-crumb">BFM Transportes › Dashboards › <b>Momentive</b></div>
        <h1>Exportação</h1>
        <div class="mtv-hero__meta" data-el="periodo"></div>
      </div>
      <div class="mtv-seg" role="group" aria-label="Filtrar por modal">
        <button type="button" data-f="TODOS" aria-pressed="true">Todos</button>
        <button type="button" data-f="FCL" aria-pressed="false">FCL</button>
        <button type="button" data-f="LCL" aria-pressed="false">LCL</button>
      </div>
    </div>
    <div class="mtv-kpis" data-el="kpis" aria-label="Indicadores do período"></div>
  </div>
</header>
<main class="mtv-body">
  <section class="mtv-sec">
    <div class="mtv-sec__hd">
      <div>
        <h2>Tempo de estufagem</h2>
        <p>Cada ponto é um embarque, posicionado pela duração entre a chegada e a saída do cliente.
           Quanto mais agrupados, mais previsível é a operação.</p>
      </div>
      <div class="mtv-leg" data-el="leg-est"></div>
    </div>
    <div class="mtv-sec__bd"><div class="chart" data-el="c-est"></div></div>
  </section>

  <section class="mtv-sec mtv-sec--ciclo">
    <div class="mtv-sec__hd">
      <div><h2>Ciclo do container, etapa por etapa</h2><p data-el="ciclo-sub"></p></div>
      <div class="mtv-leg" data-el="leg-ciclo"></div>
    </div>
    <div class="mtv-sec__bd">
      <div data-el="tira"></div>
      <div class="chart" data-el="c-ciclo"></div>
    </div>
  </section>

  <div class="mtv-grid2">
    <section class="mtv-sec mtv-sec--ctx">
      <div class="mtv-sec__hd">
        <div><h2>Embarques por mês</h2><p data-el="mes-sub"></p></div>
        <div class="mtv-leg" data-el="leg-mes"></div>
      </div>
      <div class="mtv-sec__bd"><div class="chart" data-el="c-mes"></div></div>
    </section>
    <section class="mtv-sec mtv-sec--ctx">
      <div class="mtv-sec__hd"><div>
        <h2>Peso por tipo de equipamento</h2>
        <p>Tonelagem acumulada; o número ao lado da barra é a quantidade de embarques.</p>
      </div></div>
      <div class="mtv-sec__bd"><div class="chart" data-el="c-peso"></div></div>
    </section>
  </div>

  <section class="mtv-sec mtv-sec--ctx mtv-sec--tabela">
    <div class="mtv-sec__hd"><div><h2>Embarques</h2><p data-el="tab-sub"></p></div></div>
    <div class="mtv-tw">
      <table class="mtv-tb">
        <thead><tr>
          <th scope="col">Referência</th><th scope="col">Modal</th><th scope="col">Carregamento</th>
          <th scope="col">Equipamento</th><th scope="col" class="n">Peso (kg)</th>
          <th scope="col" class="n">Estufagem (h)</th><th scope="col" class="n">Ciclo (dias)</th>
          <th scope="col">Reserva</th>
        </tr></thead>
        <tbody data-el="tbody"></tbody>
      </table>
    </div>
  </section>

  <div class="mtv-nota" data-el="nota" hidden></div>
  <p class="mtv-foot">Fonte: planilha de programação BFM Transportes · cliente Momentive Performance Materials.
     Estufagem em horas decimais; ciclo em dias corridos.</p>
</main>`;

export interface Dashboard {
  /** Redesenha com outro conjunto de dados, preservando o filtro ativo. */
  atualizar(dados: Embarque[]): void;
  /** Remove listeners e limpa o hospedeiro. Chame no `detached` do Aurelia. */
  destruir(): void;
}

export function montarDashboard(hospedeiro: HTMLElement, dados: Embarque[]): Dashboard {
  const raiz = document.createElement("div");
  raiz.className = "mtv";
  raiz.innerHTML = GABARITO;
  hospedeiro.replaceChildren(raiz);

  const el = <T extends HTMLElement = HTMLElement>(nome: string) =>
    raiz.querySelector(`[data-el="${nome}"]`) as T;

  let todos = dados;
  let filtro: Filtro = "TODOS";
  /** Domínio mensal contínuo do período inteiro, incluindo meses sem embarque. */
  let meses: string[] = [];
  /* Lido da LARGURA DO CONTAINER, não do viewport — mesmo critério do resto do
     dash (product register: responsivo é estrutural, não fluido). Isso importa
     porque o mesmo componente pode nascer num painel estreito do Aurelia em
     tela cheia de desktop; "mobile" aqui é "pouco espaço", não "é celular". */
  let compacto = false;
  const LARGURA_COMPACTA = 640;

  const sel = () => (filtro === "TODOS" ? todos : todos.filter((d) => d.modal === filtro));

  function recalcularMeses() {
    const ks = todos.map((x) => x.carregamento.slice(0, 7)).sort();
    meses = [];
    if (!ks.length) return;
    let cur = new Date(`${ks[0]}-01T00:00:00Z`);
    const fim = new Date(`${ks[ks.length - 1]}-01T00:00:00Z`);
    while (cur <= fim) {
      meses.push(cur.toISOString().slice(0, 7));
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
  }

  /* ── comparação mês a mês ────────────────────────────────────────────────
     Pega os dois meses mais recentes que AMBOS tenham volume suficiente, e diz
     quais são. Não é "vs. mês anterior": o mês anterior pode ter 4 embarques e
     a seta viraria ficção. Sem par elegível, o KPI simplesmente não mostra delta. */
  interface Delta { txt: string; pior: boolean; }
  function delta(rows: Embarque[], valor: (r: Embarque[]) => number, menorEhMelhor = true, fmt = (v: number) => nf(v, 2)): Delta | null {
    const porMes = new Map<string, Embarque[]>();
    for (const r of rows) {
      const k = r.carregamento.slice(0, 7);
      (porMes.get(k) ?? porMes.set(k, []).get(k)!).push(r);
    }
    const elegiveis = [...porMes.entries()]
      .filter(([, v]) => v.length >= MIN_COMPARACAO)
      .sort(([a], [b]) => ascending(a, b));
    if (elegiveis.length < 2) return null;

    const [kAnt, vAnt] = elegiveis[elegiveis.length - 2]!;
    const [kAtu, vAtu] = elegiveis[elegiveis.length - 1]!;
    const d = valor(vAtu) - valor(vAnt);
    if (Math.abs(d) < 0.005) return { txt: `estável · ${mesChave(kAtu)} vs ${mesChave(kAnt)}`, pior: false };
    const subiu = d > 0;
    return {
      txt: `${subiu ? "▲" : "▼"} ${fmt(Math.abs(d))} · ${mesChave(kAtu)} vs ${mesChave(kAnt)}`,
      pior: menorEhMelhor ? subiu : !subiu,
    };
  }

  /* ── mini box plot inline exibido sob cada indicador ─────────────────────── */
  function faixa(vals: number[], cor: string): string {
    if (vals.length < 3) return "";
    const w = 160, h = 14;
    const lo = min(vals)!, hi = max(vals)!;
    const x = (v: number) => (hi === lo ? w / 2 : 4 + ((v - lo) / (hi - lo)) * (w - 8));
    const q1 = x(quantile(vals, 0.25)!), q3 = x(quantile(vals, 0.75)!), m = x(med(vals));
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"
      aria-label="Faixa de ${nf(lo, 2)} a ${nf(hi, 2)}, mediana ${nf(med(vals), 2)}">
      <line x1="4" x2="${w - 4}" y1="${h / 2}" y2="${h / 2}" stroke="${cor}" stroke-opacity=".3" stroke-width="1.5" stroke-linecap="round"/>
      <rect x="${q1}" y="${h / 2 - 3.5}" width="${Math.max(q3 - q1, 1.5)}" height="7" rx="1.5" fill="${cor}" opacity=".55"/>
      <line x1="${m}" x2="${m}" y1="1" y2="${h - 1}" stroke="${cor}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }

  const kpi = (rotulo: string, valor: string, unidade: string, sub: string, d?: Delta | null, vals?: number[]) =>
    `<div class="mtv-kpi">
      <div class="mtv-kpi__k">${esc(rotulo)}</div>
      <div class="mtv-kpi__v">
        <span>${valor}${unidade ? `<small> ${unidade}</small>` : ""}</span>
        ${d ? `<span class="mtv-delta${d.pior ? " mtv-delta--pior" : ""}">${d.txt}</span>` : ""}
      </div>
      <div class="mtv-kpi__sub">${esc(sub)}</div>
      ${vals ? faixa(vals, "#FFFFFF") : ""}
    </div>`;

  /* ── 1. KPIs no hero ─────────────────────────────────────────────────────
     Sempre 4. Filtrar por um modal troca quais fazem sentido em vez de esvaziar
     a faixa — com 2 o flex esticava cada um para meia tela.                  */
  function kpis() {
    const d = sel();
    const fcl = d.filter((x) => x.modal === "FCL");
    const lcl = d.filter((x) => x.modal === "LCL");
    const medEst = (r: Embarque[]) => med(r.map((x) => x.estufagemH));
    const medCic = (r: Embarque[]) => med(r.map((x) => x.cicloDias!));

    const estufagem = (rows: Embarque[], sufixo: string) => {
      const v = rows.map((x) => x.estufagemH).sort(ascending);
      return kpi(`Estufagem mediana${sufixo}`, nf(med(v), 2), "h",
        `${rows.length} embarques · ${nf(min(v)!, 2)} a ${nf(max(v)!, 2)} h`,
        delta(rows, medEst), v);
    };
    const ciclo = (rows: Embarque[]) => {
      const v = rows.map((x) => x.cicloDias!).sort(ascending);
      return kpi("Ciclo do container", nf(med(v), 1), "dias",
        `mediana · ${nf(min(v)!, 1)} a ${nf(max(v)!, 1)} dias`,
        delta(rows, medCic, true, (x) => nf(x, 1)), v);
    };

    const t = sum(d, (x) => x.peso) / 1000;
    const imo = d.filter((x) => x.imo).length;
    const total = kpi("Embarques no período", n0(d.length), "",
      `${nf(t, 1)} t movimentadas${imo ? ` · ${imo} com carga IMO` : ""}`,
      delta(d, (r) => r.length, false, (x) => nf(x, 0)));

    let cards: string[];
    if (filtro === "FCL") {
      const pv = fcl.map((x) => x.peso / 1000).sort(ascending);
      cards = [estufagem(fcl, ""), ciclo(fcl),
        kpi("Peso mediano por container", nf(med(pv), 1), "t", `${nf(min(pv)!, 1)} a ${nf(max(pv)!, 1)} t`, null, pv), total];
    } else if (filtro === "LCL") {
      const vv = lcl.map((x) => x.volumes ?? 0).sort(ascending);
      const pesos = lcl.map((x) => x.peso);
      cards = [estufagem(lcl, ""),
        kpi("Volumes consolidados", n0(sum(vv)), "", `mediana de ${n0(med(vv))} por embarque · até ${n0(max(vv)!)}`, null, vv),
        kpi("Peso mediano por embarque", nf(med(pesos), 0), "kg",
          `${n0(Math.round(min(pesos)!))} a ${n0(Math.round(max(pesos)!))} kg`), total];
    } else {
      cards = [estufagem(fcl, " · FCL"), estufagem(lcl, " · LCL"), ciclo(fcl), total];
    }
    el("kpis").innerHTML = cards.join("");
  }

  /** Mede o container e desenha; Plot precisa de largura explícita. */
  function desenhar(nome: string, spec: Plot.PlotOptions) {
    const alvo = el(nome);
    alvo.replaceChildren();
    alvo.append(Plot.plot({ ...ESTILO_PLOT, ...spec, width: Math.max(alvo.clientWidth || 640, 320) }) as Node);
  }

  const estadoVazio = (nome: string, titulo: string, texto: string) => {
    el(nome).innerHTML = `<div class="mtv-empty"><strong>${titulo}</strong><p>${texto}</p></div>`;
  };

  /* ── 2. tempo de estufagem, como distribuição ────────────────────────────
     Beeswarm em vez de série temporal: a operação só engrena em abril e o eixo
     de tempo deixava metade do gráfico em branco. Aqui a densidade é o dado. */
  function estufagem() {
    const d = sel();
    const modais = [...new Set(d.map((x) => x.modal))].sort() as Modal[];
    const medianas = modais.map((m) => ({ modal: m, v: med(d.filter((x) => x.modal === m).map((x) => x.estufagemH)) }));

    el("leg-est").innerHTML =
      modais.map((m) => `<span><i style="background:${COR_MODAL[m]}"></i>${m}</span>`).join("") +
      `<span><i class="dash"></i>mediana do modal</span>`;

    /* Altura fixa estourava quando muitos embarques caem no mesmo valor: dodgeY
       empilha os pontos sem saber da altura do frame, e a pilha vazava por cima
       e por baixo (visto com o filtro LCL — 8 embarques cravados em 1,00h). A
       altura por facet agora nasce do pior empilhamento real dos dados: pontos
       a menos de 0,05h de distância colidem no pixel e formam pilha, então
       o bin de 0,05h é o proxy que usamos para prever quanto o dodge vai empilhar. */
    const R = 4.5, ESPACO_PONTO = 2 * R + 1.5;
    const maiorPilha = (rows: Embarque[]) => {
      const bins = new Map<number, number>();
      for (const r of rows) {
        const b = Math.round(r.estufagemH / 0.05);
        bins.set(b, (bins.get(b) ?? 0) + 1);
      }
      return Math.max(1, ...bins.values());
    };
    const pilha = Math.max(...modais.map((m) => maiorPilha(d.filter((x) => x.modal === m))));
    // +24 de folga: é onde vivem o rótulo do modal e o texto "mediana X h", que também
    // moram dentro do frame (frameAnchor "top-left"/"top") e não podem colidir com o topo da pilha.
    const alturaFacet = Math.max(pilha * ESPACO_PONTO, 60) + 24;
    const marginTop = 14, marginBottom = 34, facetGap = 10;
    const altura = marginTop + marginBottom + modais.length * alturaFacet + (modais.length - 1) * facetGap;

    // Sem espaço pro texto "mediana X h" ao lado da régua: no compacto ele some
    // e sobra só a linha tracejada — a legenda já explica o que ela é, e o
    // valor exato já está no KPI do hero logo acima.
    desenhar("c-est", {
      height: altura,
      marginLeft: compacto ? 30 : 46, marginRight: compacto ? 10 : 78, marginTop, marginBottom,
      x: { label: "horas de estufagem", labelArrow: "none", grid: true, zero: true, nice: true, tickFormat: tickNum, ticks: compacto ? 4 : undefined },
      fy: { domain: modais, label: null, axis: null },
      color: { domain: modais, range: modais.map((m) => COR_MODAL[m]) },
      marks: [
        Plot.frame({ stroke: C.border }),
        Plot.text(modais, {
          fy: (m: Modal) => m, text: (m: Modal) => m, frameAnchor: "top-left", dx: 7, dy: 7,
          fill: (m: Modal) => COR_MODAL[m], fontSize: 11, fontWeight: 600, textAnchor: "start",
        }),
        Plot.ruleX(medianas, { fy: "modal", x: "v", stroke: C.navy400, strokeDasharray: "4 3", strokeWidth: 1.25 }),
        ...(compacto ? [] : [Plot.text(medianas, {
          fy: "modal", x: "v", frameAnchor: "top", dy: 4, dx: 6, textAnchor: "start",
          text: (dd: { v: number }) => `mediana ${horas(dd.v)}`, fill: C.navy400, fontSize: 10,
        })]),
        Plot.dot(d, Plot.dodgeY("middle", {
          x: "estufagemH", fy: "modal", fill: "modal", r: 4.5,
          stroke: C.surface, strokeWidth: 1, fillOpacity: 0.9,
        })),
        Plot.tip(d, Plot.pointer(Plot.dodgeY("middle", {
          x: "estufagemH", fy: "modal", fontSize: 11, lineHeight: 1.35,
          title: (dd: Embarque) => [
            `${dd.ref}  ·  ${dd.modal}`,
            `Estufagem: ${horas(dd.estufagemH)}`,
            `Carregamento: ${dia(dd.carregamento)}`,
            `Chegada: ${hora(dd.chegada)}`,
            `Saída: ${hora(dd.saida)}`,
            `Peso: ${nf(dd.peso, 0)} kg`,
            dd.container ? `Container: ${dd.container}` : equip(dd),
          ].join("\n"),
        }))),
      ],
    });
  }

  /* ── 3. ciclo do container, decomposto por etapa (só FCL) ────────────────
     A barra sólida dizia quantos dias; esta diz ONDE os dias foram. Na base de
     jan–jul/2026 a estufagem é 2,5% do ciclo — a métrica que o cliente pediu é
     a menor fatia, e isso só fica visível decompondo.                        */
  function ciclo() {
    const d = sel().filter((x) => x.cicloDias != null && x.etapas != null);
    if (!d.length) {
      el("ciclo-sub").textContent = "Métrica exclusiva de FCL.";
      el("leg-ciclo").innerHTML = "";
      el("tira").innerHTML = "";
      estadoVazio("c-ciclo", "LCL não tem ciclo de container",
        "Em LCL a carga é consolidada com a de outros embarcadores: não há retirada de container vazio, então o ciclo não existe. Para esses embarques o indicador de tempo é a estufagem. Selecione <b>FCL</b> ou <b>Todos</b> no filtro acima.");
      return;
    }
    const vals = d.map((x) => x.cicloDias!).sort(ascending);
    const m = med(vals);
    const limite = m * 2;
    const acima = d.filter((x) => x.cicloDias! > limite);

    /* Tira de proporção: o ciclo inteiro do período, em % por etapa. */
    const totalGeral = sum(d, (x) => x.cicloDias!);
    const parcelas = ETAPAS.map((e) => ({ ...e, pct: (sum(d, (x) => x.etapas![e.chave]) / totalGeral) * 100 }));
    el("tira").innerHTML =
      `<div class="mtv-tira">${parcelas.map((p) =>
        `<span style="width:${p.pct}%;background:${p.cor};color:${p.texto}"
               title="${p.rotulo}: ${nf(p.pct, 1)}%">${p.pct >= 7 ? `${nf(p.pct, 1)}%` : ""}</span>`).join("")}</div>` +
      `<div class="mtv-tira__leg">${parcelas.map((p) =>
        `<span><i style="background:${p.cor}"></i>${p.rotulo} · <b>${nf(p.pct, 1)}%</b> · mediana ${duracao(med(d.map((x) => x.etapas![p.chave])))}</span>`).join("")}</div>`;

    const menor = parcelas.reduce((a, b) => (a.pct < b.pct ? a : b));
    el("ciclo-sub").innerHTML =
      `Da retirada do vazio até a entrega no terminal, por embarque FCL. Mediana de <b>${dias(m)}</b>. ` +
      `A <b>${menor.rotulo.toLowerCase()}</b> responde por apenas <b>${nf(menor.pct, 1)}%</b> do ciclo — ` +
      `o tempo está na espera do container e no trânsito ao terminal.` +
      (acima.length ? ` ${acima.length} embarques passam do dobro da mediana (${dias(limite)}) — o valor deles vai em negrito.` : "");

    // Só a linha tracejada aqui: as cores das etapas já estão legendadas na tira,
    // logo abaixo, e lá com percentual e mediana. Repetir seria ruído.
    el("leg-ciclo").innerHTML = `<span><i class="dash"></i>mediana do ciclo</span>`;

    const ord = [...d].sort((a, b) => descending(a.cicloDias!, b.cicloDias!));
    // Formato longo: uma linha por (embarque × etapa), que é o que o stackX espera.
    const barras = ord.flatMap((x) => ETAPAS.map((e) => ({
      ref: x.ref, etapa: e.chave, rotulo: e.rotulo, v: x.etapas![e.chave], emb: x,
    })));

    desenhar("c-ciclo", {
      // 14px por linha. A conta e do PDF: cabecalho + tira + grafico tem que caber
      // nos ~725px uteis de uma A4 paisagem, senao o Chromium parte a secao entre a
      // tira de proporcao e as barras — o SVG nao se divide, entao ele pula inteiro
      // para a folha seguinte e deixa meia pagina em branco. Com 16px estourava 24px.
      // Acima de ~36 embarques FCL a secao passa a ocupar duas folhas; e aceitavel.
      height: Math.max(ord.length * 14 + 50, 180),
      // 168 é o que a referência mais longa ("EXP 255-256-257-258/2026") exige
      // por inteiro. Sem esse espaço (mobile), o rótulo é truncado com reticências
      // — a referência completa continua no tooltip, então nada se perde.
      marginLeft: compacto ? 92 : 168, marginRight: compacto ? 34 : 52, marginTop: 10, marginBottom: 32,
      x: { label: "dias", labelArrow: "none", grid: true, zero: true, nice: true, tickFormat: tickNum, ticks: compacto ? 4 : undefined },
      y: {
        domain: ord.map((x) => x.ref), label: null, tickSize: 0,
        tickFormat: compacto ? (ref: string) => truncar(ref, 13) : undefined,
      },
      color: { domain: ETAPAS.map((e) => e.chave), range: ETAPAS.map((e) => e.cor) },
      marks: [
        Plot.frame({ stroke: C.border }),
        // stroke branco separa segmentos vizinhos mesmo quando a etapa é uma lasca de 2%.
        Plot.barX(barras, {
          y: "ref", x: "v", fill: "etapa", order: ETAPAS.map((e) => e.chave),
          insetTop: 2.5, insetBottom: 2.5, stroke: C.surface, strokeWidth: 1,
        }),
        // `dx`, `textAnchor` e `fontWeight` são constantes, não canais. Para variar o peso
        // entre normal e outlier são duas marcas com os dados filtrados — passar função
        // em `fontWeight` não compila, e em `dx` geraria NaN e corromperia o SVG.
        Plot.text(ord.filter((x) => x.cicloDias! <= limite), {
          y: "ref", x: "cicloDias", dx: 6, textAnchor: "start", fontSize: 10, fill: C.muted,
          text: (x: Embarque) => nf(x.cicloDias!, 1),
        }),
        // Outlier em NEGRITO, não em laranja: o laranja virou cor de categoria
        // (trânsito) e usá-lo aqui faria o rótulo parecer legenda do segmento.
        // O comprimento da barra e a régua da mediana já carregam o sinal.
        Plot.text(acima, {
          y: "ref", x: "cicloDias", dx: 6, textAnchor: "start", fontSize: 10,
          fill: C.ink, fontWeight: 600,
          text: (x: Embarque) => nf(x.cicloDias!, 1),
        }),
        Plot.ruleX([m], { stroke: C.navy400, strokeDasharray: "4 3", strokeWidth: 1.25 }),
        Plot.tip(barras, Plot.pointerY({
          y: "ref", x: "v", fontSize: 11, lineHeight: 1.35,
          title: (b: { emb: Embarque }) => {
            const x = b.emb;
            return [
              `${x.ref}  ·  ${dias(x.cicloDias!)} no total`,
              `Container: ${x.container ?? "—"}`,
              "",
              ...ETAPAS.map((e) => `${e.rotulo}: ${duracao(x.etapas![e.chave])}`),
              "",
              `Vazio retirado: ${dia(x.vazio!)}`,
              `Entregue no terminal: ${hora(x.terminal)}`,
              x.ajuste ? `⚠ ${x.ajuste}` : "",
            ].filter((l) => l !== undefined).join("\n");
          },
        })),
      ],
    });
  }

  /* ── 4. embarques por mês ────────────────────────────────────────────────
     Escala de banda com domínio montado à mão. Com `x.interval: "month"` numa escala
     utc o Plot abria um slot vazio depois do último mês e fatiava a última barra.
     O domínio vem da base inteira, não do filtro, para o eixo não dançar ao trocar
     de modal — e inclui os meses sem embarque, porque o buraco é informação.    */
  function porMes() {
    const d = sel();
    const modais = [...new Set(d.map((x) => x.modal))].sort() as Modal[];
    const vazios = meses.filter((k) => !todos.some((x) => x.carregamento.startsWith(k)));

    el("leg-mes").innerHTML = modais.map((m) => `<span><i style="background:${COR_MODAL[m]}"></i>${m}</span>`).join("");
    const nomes = vazios.map((k) => mesLongo(k).split(" de ")[0]!);
    el("mes-sub").textContent = nomes.length
      ? `${maiuscula(nomes.join(" e "))} não ${nomes.length > 1 ? "tiveram" : "teve"} embarque.`
      : "Volume mensal por modal.";

    desenhar("c-mes", {
      height: 230, marginLeft: compacto ? 30 : 46, marginRight: 12, marginTop: 12, marginBottom: 30,
      x: { type: "band", domain: meses, label: null, tickFormat: (k: string) => mesChave(k) },
      y: { label: "embarques", labelArrow: "none", grid: true, nice: true, tickFormat: tickNum },
      color: { domain: modais, range: modais.map((m) => COR_MODAL[m]) },
      marks: [
        Plot.frame({ stroke: C.border }),
        Plot.barY(d, Plot.groupX({ y: "count" }, { x: (dd: Embarque) => dd.carregamento.slice(0, 7), fill: "modal", rx: 2 })),
        Plot.tip(d, Plot.pointerX(Plot.groupX({
          y: "count",
          title: (g: Embarque[]) => {
            const partes = rollups(g, (v) => v.length, (v) => v.modal).sort();
            const cab = g[0] ? mesLongo(g[0].carregamento) : "";
            return [cab, ...partes.map(([mm, n]) => `${mm}: ${n}`), `Total: ${g.length}`].filter(Boolean).join("\n");
          },
        }, { x: (dd: Embarque) => dd.carregamento.slice(0, 7), fontSize: 11, lineHeight: 1.35 }))),
      ],
    });
  }

  /* ── 5. peso por equipamento ─────────────────────────────────────────────── */
  function porEquipamento() {
    const g = rollups(sel(),
      (v) => ({ t: sum(v, (x) => x.peso) / 1000, n: v.length, modal: v[0]!.modal }),
      (x) => (x.modal === "FCL" ? x.tipo ?? "Não informado" : "LCL · carga solta"),
    ).map(([eq, v]) => ({ eq, ...v })).sort((a, b) => descending(a.t, b.t));

    desenhar("c-peso", {
      height: Math.max(g.length * 32 + 46, 160),
      // "LCL · carga solta" e "Não informado" são os rótulos mais longos; truncados
      // no compacto, completos no tooltip nativo do navegador (title do <title> do
      // eixo não existe — mas o texto cabe no eixo mesmo truncado o suficiente pra
      // reconhecer, e a barra + valor ao lado já identificam a categoria).
      marginLeft: compacto ? 78 : 116, marginRight: compacto ? 46 : 74, marginTop: 8, marginBottom: 30,
      x: { label: "toneladas", labelArrow: "none", grid: true, zero: true, nice: true, tickFormat: tickNum, ticks: compacto ? 4 : undefined },
      y: {
        domain: g.map((x) => x.eq), label: null, tickSize: 0,
        tickFormat: compacto ? (eq: string) => truncar(eq, 12) : undefined,
      },
      marks: [
        Plot.frame({ stroke: C.border }),
        Plot.barX(g, { y: "eq", x: "t", fill: (x: { modal: Modal }) => COR_MODAL[x.modal], insetTop: 5, insetBottom: 5, rx: 2 }),
        Plot.text(g, {
          y: "eq", x: "t", dx: 7, textAnchor: "start", fontSize: 10, fill: C.muted,
          text: (x: { t: number; n: number }) => `${nf(x.t, 1)} t · ${x.n}×`,
        }),
      ],
    });
  }

  /* ── 6. tabela ───────────────────────────────────────────────────────────── */
  function tabela() {
    const d = [...sel()].sort((a, b) => descending(a.carregamento, b.carregamento) || descending(a.id, b.id));
    el("tab-sub").textContent = `${d.length} embarques, do mais recente para o mais antigo.`;
    el("tbody").innerHTML = d.map((x) => `<tr>
      <td class="ref">${esc(x.ref)}${x.ajuste ? `<button class="mtv-flag" type="button" title="${esc(x.ajuste)}" aria-label="Data ajustada: ${esc(x.ajuste)}">⚠ ajustado</button>` : ""}</td>
      <td><span class="mtv-chip mtv-chip--${x.modal.toLowerCase()}">${x.modal}</span>${x.imo ? ' <span class="mtv-chip mtv-chip--imo" title="Carga perigosa">IMO</span>' : ""}</td>
      <td class="mtv-mono">${dia(x.carregamento)}</td>
      <td>${x.container
        ? `<span class="mtv-mono">${esc(x.container)}</span> <span class="mtv-dim">${esc(x.tipo ?? "")}</span>`
        : `<span class="mtv-dim">${equip(x)}</span>`}</td>
      <td class="n mtv-mono">${nf(x.peso, 0)}</td>
      <td class="n">${nf(x.estufagemH, 2)}</td>
      <td class="n">${x.cicloDias != null ? nf(x.cicloDias, 1) : '<span class="mtv-dim">—</span>'}</td>
      <td class="mtv-mono">${esc(x.reserva)}</td>
    </tr>`).join("");
  }

  /* ── cabeçalho e nota de qualidade de dado ───────────────────────────────── */
  function estatico() {
    const ds = todos.map((x) => x.carregamento).sort();
    const [ini, fim] = [ds[0], ds[ds.length - 1]];
    el("periodo").innerHTML = ini && fim
      ? `Carregamentos de <time>${dia(ini)}</time> a <time>${dia(fim)}</time> · ${todos.length} embarques`
      : "Sem embarques no período";

    const aj = todos.filter((x) => x.ajuste);
    const nota = el("nota");
    nota.hidden = aj.length === 0;
    if (aj.length) {
      nota.innerHTML =
        `<strong>${aj.length === 1 ? "Um registro teve" : `${aj.length} registros tiveram`} a data corrigida.</strong>
         A planilha traz um erro de digitação de mês, que sem tratamento produziria um ciclo negativo e derrubaria a
         média do indicador. Os valores exibidos já usam a data corrigida; a correção precisa ser refeita na origem.
         <ul>${aj.map((x) => `<li><code>${esc(x.ref)}</code> — ${esc(x.ajuste!)}</li>`).join("")}</ul>`;
    }
  }

  function render() {
    compacto = raiz.clientWidth > 0 && raiz.clientWidth < LARGURA_COMPACTA;
    kpis(); estufagem(); ciclo(); porMes(); porEquipamento(); tabela();
  }

  /* ── eventos ─────────────────────────────────────────────────────────────── */
  // Array.from e não spread: o tsconfig da raiz usa lib DOM sem DOM.Iterable.
  const botoes = Array.from(raiz.querySelectorAll<HTMLButtonElement>(".mtv-seg button"));
  const aoClicar = (ev: Event) => {
    const b = ev.currentTarget as HTMLButtonElement;
    const f = b.dataset.f as Filtro;
    if (f === filtro) return;
    filtro = f;
    botoes.forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    render();
  };
  botoes.forEach((b) => b.addEventListener("click", aoClicar));

  let t: ReturnType<typeof setTimeout>;
  const aoRedimensionar = () => { clearTimeout(t); t = setTimeout(render, 140); };
  addEventListener("resize", aoRedimensionar);

  recalcularMeses();
  estatico();
  render();

  return {
    atualizar(novos) { todos = novos; recalcularMeses(); estatico(); render(); },
    destruir() {
      removeEventListener("resize", aoRedimensionar);
      clearTimeout(t);
      botoes.forEach((b) => b.removeEventListener("click", aoClicar));
      hospedeiro.replaceChildren();
    },
  };
}
