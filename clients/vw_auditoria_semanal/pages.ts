import type { Dados } from "./queries";
import { PISO_AMOSTRA, TICKET_MEDIO } from "./queries";
import { graficos as g, COR, legenda, perda, venda } from "./report";
import { num, pct, dt } from "../../core/report";
import * as n from "./narrativa";

export const titulo = "Volkswagen — Auditoria de Leads: leitura semanal";

const dia = (s: string) => dt(s + "T12:00:00Z");

/** KPI com delta contra a semana anterior. `maiorEhMelhor` decide a cor da seta:
 *  em vendas perdidas, subir é ruim. */
function kpi(
  label: string,
  valor: string,
  nota: string,
  delta?: { atual: number; anterior: number; maiorEhMelhor?: boolean; unidade?: string; casas?: number },
  /** Valor em texto (não número): fonte menor para caber no card, mesma altura de linha. */
  textual?: { comparacao?: string },
) {
  let seta = textual?.comparacao ? `<span class="delta flat">${textual.comparacao}</span>` : "";
  if (delta) {
    const dif = delta.atual - delta.anterior;
    const bom = (delta.maiorEhMelhor ?? true) ? dif > 0 : dif < 0;
    const cls = Math.abs(dif) < 0.05 ? "flat" : bom ? "pos" : "neg";
    const sinal = dif > 0 ? "▲" : dif < 0 ? "▼" : "■";
    seta = `<span class="delta ${cls}">${sinal} ${num(Math.abs(dif), delta.casas ?? 1)}${delta.unidade ?? " p.p."}</span>`;
  }
  return `<div class="card kpi">
    <div class="label">${label}</div>
    <div class="value${textual ? " texto" : ""}">${valor}</div>
    ${seta}
    <div class="small muted" style="margin-top:1mm">${nota}</div>
  </div>`;
}

type TempoTop = Dados["atual"]["tempoTop"];

/** Faixa de tempo de atendimento mais citada no período. Categoria não tem seta: a comparação
 *  com o período anterior vai por extenso, no mesmo lugar onde os outros KPIs põem o delta.
 *  `anterior` undefined = sem base comparável (mês anterior vazio ou de antes do questionário):
 *  a linha some, como a seta dos demais KPIs. */
function kpiTempo(periodo: "semana" | "mês", atual: TempoTop, anterior: TempoTop | undefined, comparavel = true) {
  const rotulo = "Tempo médio de atendimento";
  const comparacao = !comparavel ? undefined : anterior ? `ant.: ${anterior.tempo}` : "ant.: sem respostas";
  if (!atual) return kpi(rotulo, "—", `nenhuma resposta de tempo no ${periodo}`, undefined, { comparacao: comparavel ? "&nbsp;" : undefined });
  return kpi(rotulo, atual.tempo, `faixa mais citada · ${pct(atual.pct, 0)} de ${num(atual.total)} respostas`, undefined, { comparacao });
}

/** Teto de 4 itens: as duas páginas são fechadas, e a 5ª bala empurra o rodapé
 *  para uma terceira folha. As funções de narrativa já entregam em ordem de
 *  relevância, então cortar a cauda é cortar o menos importante. */
const mediaN = (linhas: { atual: { n: number } }[]) => Math.round(linhas.reduce((a, r) => a + r.atual.n, 0) / linhas.length);

const lista = (itens: string[], vazio: string) =>
  itens.length
    ? `<ul class="bullets">${itens.slice(0, 4).map((i) => `<li>${i}</li>`).join("")}</ul>`
    : `<p class="small muted">${vazio}</p>`;

export function documento(d: Dados): string {
  const a = d.atual;
  const b = d.anterior;
  const mes = d.mes.atual;
  const mesAnt = d.mes.anterior;

  // Mês anterior sem auditoria é caso real, não defeito: a auditoria trabalha
  // em mutirão e um mês inteiro pode vir vazio. Sem amostra do outro lado, o
  // KPI fica sem seta — desenhar "▼ 54,6 p.p." ali seria ler cobertura como
  // desempenho, o mesmo erro que a escolha da semana existe para evitar.
  const temMesAnterior = n.mesComparavel(d);
  const mesDelta = <T>(delta: T) => (temMesAnterior ? delta : undefined);

  // Sem colunas de leads/vendas da base: elas são volume da rede inteira e as
  // vizinhas são contagem de amostra. Lado a lado, convidam exatamente a
  // multiplicação que o "Não faça" deste cliente proíbe.
  const tabelaRegional = `<table class="compacta">
    <thead><tr>
      <th>Regional</th><th class="num">Contato</th><th class="num">Δ vs. sem. ant.</th>
      <th class="num">Respostas</th><th class="num">Sem contato</th><th class="num">Vendas perdidas</th>
    </tr></thead>
    <tbody>${d.regional
      .map((r) => {
        const dif = r.atual.tx - r.anterior.tx;
        const fraca = r.atual.n < PISO_AMOSTRA;
        return `<tr${fraca ? ' class="fraca"' : ""}>
        <td class="nome">R${r.regional}</td>
        <td class="num">${pct(r.atual.tx)}</td>
        <td class="num ${dif > 0 ? "pos" : dif < 0 ? "neg" : ""}">${dif > 0 ? "+" : dif < 0 ? "−" : ""}${num(Math.abs(dif), 1)}</td>
        <td class="num">${fraca ? `<span class="aviso-n">${num(r.atual.n)}</span>` : num(r.atual.n)}</td>
        <td class="num">${num(r.atual.semContato ?? 0)}</td>
        <td class="num">${num(r.atual.perdas)}</td>
      </tr>`;
      })
      .join("")}</tbody>
  </table>`;

  const tabelaPiores = `<table class="compacta">
    <thead><tr><th>Concessionária · DN</th><th class="num">Contato</th><th class="num">Sem contato</th><th class="num">n</th></tr></thead>
    <tbody>${d.piores
      .slice(0, 5)
      .map(
        (p) => `<tr>
        <td class="nome">${p.nome} <span class="muted" style="font-weight:400">· ${p.dn}</span></td>
        <td class="num neg">${pct(p.tx)}</td>
        <td class="num">${num(p.semContato)}</td>
        <td class="num muted">${num(p.n)}</td>
      </tr>`,
      )
      .join("")}</tbody>
  </table>`;

  const tabelaOrigem = `<table class="compacta">
    <thead><tr><th>Origem do lead</th><th class="num">Contato</th><th class="num">Sem contato</th><th class="num">n</th></tr></thead>
    <tbody>${d.origem
      .slice(0, 5)
      .map(
        (o) => `<tr>
        <td class="nome">${o.origem}</td>
        <td class="num ${o.tx < 50 ? "neg" : ""}">${pct(o.tx)}</td>
        <td class="num">${num(o.semContato)}</td>
        <td class="num muted">${num(o.n)}</td>
      </tr>`,
      )
      .join("")}</tbody>
  </table>`;

  const tabelaDesfecho = `<table class="compacta">
    <thead><tr>
      <th>Desfecho declarado pelo cliente</th><th class="num">% do mês</th>
      ${temMesAnterior ? `<th class="num">Δ vs. mês ant.</th>` : ""}<th class="num">Respostas</th>
    </tr></thead>
    <tbody>${d.mes.desfecho
      .slice(0, 6)
      .map((m) => {
        const fraca = m.n < PISO_AMOSTRA;
        const semBase = !temMesAnterior || m.nAnt < PISO_AMOSTRA;
        const parado = Math.abs(m.dif) < 0.05;
        const subir = venda(m.motivo) ? "pos" : perda(m.motivo) ? "neg" : "";
        const cor = semBase || parado || !subir ? "muted" : m.dif > 0 ? subir : subir === "pos" ? "neg" : "pos";
        return `<tr${fraca ? ' class="fraca"' : ""}>
        <td class="nome">${m.motivo}</td>
        <td class="num">${pct(m.pct)}</td>
        ${temMesAnterior ? `<td class="num ${cor}">${semBase ? "—" : parado ? "0,0" : `${m.dif > 0 ? "+" : "−"}${num(Math.abs(m.dif), 1)}`}</td>` : ""}
        <td class="num">${fraca ? `<span class="aviso-n">${num(m.n)}</span>` : num(m.n)}</td>
      </tr>`;
      })
      .join("")}</tbody>
  </table>`;

  // Contagem e sem Δ: nenhuma marca chega ao piso no mês, e seta sobre 3
  // respostas seria ruído. "nova" só existe se há mês anterior para comparar.
  const tabelaMarcas = d.concorrencia.mes.length
    ? `<table class="compacta">
    <thead><tr><th>Marca</th><th class="num">No mês</th>${temMesAnterior ? `<th class="num">Mês ant.</th>` : ""}</tr></thead>
    <tbody>${d.concorrencia.mes
      .slice(0, 6)
      .map(
        (m) => `<tr${m.n < PISO_AMOSTRA ? ' class="fraca"' : ""}>
        <td class="nome">${m.marca}${temMesAnterior && !m.nAnt ? ' <span class="tag-nova">nova</span>' : ""}</td>
        <td class="num">${num(m.n)}</td>
        ${temMesAnterior ? `<td class="num">${num(m.nAnt)}</td>` : ""}
      </tr>`,
      )
      .join("")}</tbody>
  </table>`
    : `<p class="small muted">Nenhum cliente nomeou a marca concorrente no mês.</p>`;

  return `
<div class="page">
  <header class="capa-semanal">
    <div class="logo"><span class="mark"></span><span class="mark vw"></span><span class="sub">Auditoria de Leads</span></div>
    <div class="periodo">Semana de <strong>${n.rotuloSemana(d.periodo.atual)}</strong><br>
    <span class="muted">vs. ${n.rotuloSemana(d.periodo.anterior)}</span></div>
  </header>

  <h1 class="titulo-semanal">O pulso da semana</h1>
  <p class="muted sub">${n.subtitulo(d)}</p>

  <section class="row" style="margin-top:4mm">
    ${kpi("Taxa de contato", pct(a.txContato), `${num(a.nContato)} respostas · ${num(a.semContato)} sem contato`, { atual: a.txContato, anterior: b.txContato })}
    ${kpi("Vendas perdidas", num(a.perdas), `na amostra ouvida · R$ ${num(a.faturamentoPerdido / 1e6, 1)} mi a ticket médio`, { atual: a.perdas, anterior: b.perdas, maiorEhMelhor: false, unidade: "", casas: 0 })}
    ${kpi("NPS", num(a.npsGeral, 1), `${num(a.nNps)} avaliações na semana`, { atual: a.npsGeral, anterior: b.npsGeral, unidade: " pts" })}
    ${kpiTempo("semana", a.tempoTop, b.tempoTop)}
  </section>

  <section style="margin-top:5mm">
    <h3>As taxas estão crescendo?</h3>
    ${g.gSerie(d, 168)}
    <figcaption>${n.tendencia(d)}</figcaption>
  </section>

  <section class="row" style="margin-top:4mm">
    <div class="card bom">
      <h3>O que está bom</h3>
      ${lista(n.oQueEstaBom(d), "Nenhum indicador melhorou o suficiente para entrar aqui nesta semana.")}
    </div>
    <div class="card ruim">
      <h3>O que está ruim</h3>
      ${lista(n.oQueEstaRuim(d), "Nenhum indicador acendeu alerta nesta semana.")}
    </div>
  </section>

  <section style="margin-top:4mm">
    <h3>Visão regional</h3>
    ${tabelaRegional}
    <figcaption><em>Vendas perdidas</em> é estimativa sobre a <strong>amostra ouvida</strong>, não projeção da rede. Linha cinza = abaixo de ${PISO_AMOSTRA} respostas.</figcaption>
  </section>

  <div class="rodape-semanal small muted">
    Base <code>LogicaChatBot</code> · ticket médio de R$ ${num(TICKET_MEDIO / 1000, 0)} mil é premissa fixa do negócio, não medição.
  </div>
</div>

<div class="page">
  <header class="capa-semanal">
    <div class="logo"><span class="mark"></span><span class="mark vw"></span><span class="sub">Auditoria de Leads</span></div>
    <div class="periodo muted">Últimas ${d.periodo.semanasJanela} semanas<br>
    <span>${dia(d.periodo.janelaInicio)} a ${dia(d.periodo.fim)}</span></div>
  </header>

  <h1 class="titulo-semanal">Perdas: onde e por quê</h1>
  <p class="muted sub">Auditorias das últimas ${d.periodo.semanasJanela} semanas${
    d.periodo.janelaInicio === d.periodo.inicioQuestionario ? ", desde a mudança do questionário" : ""
  } · piso de ${PISO_AMOSTRA} respostas por recorte.</p>

  <section style="margin-top:4mm">
    <h3>NPS × tempo de atendimento</h3>
    ${g.gNpsTempo(d, 144)}
    <figcaption>${n.correlacaoNpsTempo(d)}</figcaption>
  </section>

  <section style="margin-top:4mm">
    <h3>Onde a venda escapa</h3>
    ${g.gMotivo(d, 136)}
    ${legenda([
      { rotulo: "Perda", cor: COR.red },
      { rotulo: "Venda", cor: COR.accent },
      { rotulo: "Neutro", cor: COR.grey },
    ])}
    <figcaption>${n.ondePerdemos(d)} ${n.paraQuem(d)}</figcaption>
  </section>

  <section class="row" style="margin-top:4mm">
    <div>
      <h3>Piores taxas de contato</h3>
      ${tabelaPiores}
    </div>
    <div>
      <h3>Origem que mais perde contato</h3>
      ${tabelaOrigem}
    </div>
  </section>

  <section style="margin-top:4mm">
    <h3>Conclusões</h3>
    <div class="aprendi">
      ${n
        .oQueAprendi(d)
        .slice(0, 3)
        .map((x) => `<div class="item"><strong>${x.titulo}.</strong> ${x.texto}</div>`)
        .join("")}
    </div>
  </section>

  <div class="rodape-semanal small muted">
    ${n.vereditoPerdas(d)}
  </div>
</div>

<div class="page">
  <header class="capa-semanal">
    <div class="logo"><span class="mark"></span><span class="mark vw"></span><span class="sub">Auditoria de Leads</span></div>
    <div class="periodo">${d.mes.fechado ? "Mês fechado em" : "Mês até"} <strong>${dia(d.mes.fim)}</strong><br>
    <span class="muted">${temMesAnterior ? `vs. ${n.rotuloIntervalo(d.mes.antInicio, d.mes.antFim)}` : "sem comparação com o mês anterior"}</span></div>
  </header>

  <h1 class="titulo-semanal">O mês até aqui</h1>
  <p class="muted sub">${n.subtituloMes(d)}</p>

  <section class="row" style="margin-top:4mm">
    ${kpi("Taxa de contato", pct(mes.txContato), `${num(mes.nContato)} respostas · ${num(mes.semContato)} sem contato`, mesDelta({ atual: mes.txContato, anterior: mesAnt.txContato }))}
    ${kpi("Vendas perdidas", num(mes.perdas), `na amostra ouvida · R$ ${num(mes.faturamentoPerdido / 1e6, 1)} mi a ticket médio`, mesDelta({ atual: mes.perdas, anterior: mesAnt.perdas, maiorEhMelhor: false, unidade: "", casas: 0 }))}
    ${kpi("NPS", num(mes.npsGeral, 1), `${num(mes.nNps)} avaliações no mês`, mesDelta({ atual: mes.npsGeral, anterior: mesAnt.npsGeral, unidade: " pts" }))}
    ${kpiTempo("mês", mes.tempoTop, mesAnt.tempoTop, temMesAnterior)}
  </section>

  <section style="margin-top:5mm">
    <h3>Regional no acumulado</h3>
    ${g.gRegional(d.mes.regional, `taxa de contato por regional no mês${temMesAnterior ? " · barra clara = mesmo recorte do mês anterior" : ""}`, 186)}
    <figcaption>É o mesmo corte da página 1 com a amostra do mês: cada regional passa de ~${num(
      mediaN(d.regional),
    )} para ~${num(mediaN(d.mes.regional))} respostas, e aí a diferença entre regionais para de ser ruído.</figcaption>
  </section>

  <section style="margin-top:4mm">
    <div class="row">
      <div style="flex:1.6">
        <h3>Desfecho declarado no mês</h3>
        ${tabelaDesfecho}
      </div>
      <div>
        <h3>Para quem perdemos no mês</h3>
        ${tabelaMarcas}
      </div>
    </div>
    <figcaption>${
      temMesAnterior
        ? `Δ em pontos percentuais contra ${n.rotuloIntervalo(d.mes.antInicio, d.mes.antFim)} — os dois recortes têm total de respostas diferente, então a comparação é de participação, não de contagem. `
        : ""
    }Linha cinza = abaixo de ${PISO_AMOSTRA} respostas. Marcas: clientes que disseram para qual concorrente foram, em contagem.</figcaption>
  </section>

  <section style="margin-top:4mm">
    <h3>O que o acumulado mostra</h3>
    ${lista(n.oQueOMesMostra(d), "O mês ainda não tem dado suficiente para somar à leitura da semana.")}
  </section>

  <div class="rodape-semanal small muted">
    ${n.vereditoMes(d)}
  </div>
</div>
`;
}
