import type { Dados } from "./queries";
import { num, pct, dt } from "../../core/report";

// Toda frase daqui muda de sentido se o dado mudar — e cada uma tem teste.
// Prosa neutra (definição de métrica, descrição de eixo) fica em pages.ts.

const pp = (v: number) => num(Math.abs(v), 1) + " p.p.";
const dia = (s: string) => dt(s + "T12:00:00Z");
const rs = (v: number) => "R$ " + num(v / 1e6, 1) + " mi";

/** Semana como intervalo legível: "27/07 a 02/08". */
export function rotuloSemana(inicio: string) {
  const fim = new Date(inicio + "T12:00:00Z");
  fim.setUTCDate(fim.getUTCDate() + 6);
  return `${dia(inicio)} a ${dt(fim)}`;
}

export function subtitulo(d: Dados) {
  return `${num(d.atual.auditados)} auditorias realizadas nesta semana, ${num(d.anterior.auditados)} na anterior.`;
}

/** Direção de uma métrica entre as duas semanas, com o veredito já embutido. */
function delta(atual: number, anterior: number, maiorEhMelhor = true) {
  const dif = atual - anterior;
  const parado = Math.abs(dif) < 0.05;
  return {
    dif,
    parado,
    bom: parado ? null : maiorEhMelhor ? dif > 0 : dif < 0,
    verbo: parado ? "ficou parada" : dif > 0 ? "subiu" : "caiu",
  };
}

export function vereditoContato(d: Dados) {
  const v = delta(d.atual.txContato, d.anterior.txContato);
  const corpo = v.parado
    ? `A taxa de contato ${v.verbo} em ${pct(d.atual.txContato)}`
    : `A taxa de contato ${v.verbo} de ${pct(d.anterior.txContato)} para ${pct(d.atual.txContato)} — ${pp(v.dif)}`;
  return `${corpo}, sobre ${num(d.atual.nContato)} respostas nesta semana e ${num(
    d.anterior.nContato,
  )} na anterior. Ainda são ${num(d.atual.semContato)} clientes dizendo que ninguém os procurou.`;
}

export function vereditoNps(d: Dados) {
  const v = delta(d.atual.npsGeral, d.anterior.npsGeral);
  const sinal = d.atual.npsGeral >= 0 ? "positivo" : "negativo";
  return `O NPS ${v.verbo} de ${num(d.anterior.npsGeral, 1)} para ${num(
    d.atual.npsGeral,
    1,
  )} (${sinal}), sobre ${num(d.atual.nNps)} avaliações. Com esse tamanho de amostra, uma semana isolada oscila — a leitura confiável é a série ao lado, não o salto entre dois pontos.`;
}

/** A pergunta "as taxas estão crescendo?" respondida pela série inteira, não por
 *  dois pontos: com ~100 respostas por semana, duas semanas viram ruído fácil. */
export function tendencia(d: Dados) {
  const s = d.serie.filter((x) => x.n >= 10);
  if (s.length < 3) return `Ainda não há semanas de auditoria suficientes para falar de tendência.`;
  const meio = Math.floor(s.length / 2);
  // ponderada por n, não média simples: uma semana de 844 respostas e outra de
  // 91 não valem o mesmo, e a janela tem semanas de mutirão de auditoria.
  const media = (xs: typeof s) => xs.reduce((a, b) => a + b.tx * b.n, 0) / xs.reduce((a, b) => a + b.n, 0);
  const velha = media(s.slice(0, meio));
  const nova = media(s.slice(meio));
  const dif = nova - velha;
  const direcao = Math.abs(dif) < 1 ? "estável" : dif > 0 ? "em alta" : "em queda";
  return `Nas ${num(s.length)} semanas de auditoria, a taxa está <strong>${direcao}</strong>: ${pct(
    velha,
  )} na primeira metade contra ${pct(nova)} na segunda (média ponderada pelo n), ${pp(dif)} de diferença.`;
}

/** O que está bom — só entra item que o dado sustenta. Lista vazia é resposta
 *  válida e o template imprime isso, em vez de inventar boa notícia. */
export function oQueEstaBom(d: Dados): string[] {
  const itens: string[] = [];
  const c = delta(d.atual.txContato, d.anterior.txContato);
  if (c.bom) itens.push(`Taxa de contato subiu ${pp(c.dif)}, para ${pct(d.atual.txContato)}.`);

  const n = delta(d.atual.npsGeral, d.anterior.npsGeral);
  if (n.bom) itens.push(`NPS subiu ${num(Math.abs(n.dif), 1)} pontos, para ${num(d.atual.npsGeral, 1)}.`);

  const rapido = d.tempo.find((t) => t.tempo === "Até 30 minutos");
  if (rapido && rapido.pct >= 15)
    itens.push(`${pct(rapido.pct)} dos atendimentos acontecem em até 30 minutos — a faixa com o melhor NPS.`);

  const subiram = d.regional.filter((r) => r.atual.n >= 10 && r.atual.tx > r.anterior.tx);
  if (subiram.length) itens.push(`${num(subiram.length)} das ${num(d.regional.length)} regionais melhoraram a taxa de contato.`);

  const v = delta(d.atual.txVendas, d.anterior.txVendas);
  if (v.bom) itens.push(`Conversão dos auditados subiu de ${pct(d.anterior.txVendas)} para ${pct(d.atual.txVendas)}.`);

  return itens;
}

export function oQueEstaRuim(d: Dados): string[] {
  const itens: string[] = [];

  if (d.atual.txContato < 60)
    itens.push(
      `${pct(100 - d.atual.txContato)} dos clientes ouvidos dizem que ninguém entrou em contato (${num(
        d.atual.semContato,
      )} de ${num(d.atual.nContato)}).`,
    );

  const lento = d.tempo.find((t) => t.tempo === "Mais de um dia");
  if (lento && lento.pct >= 20)
    itens.push(`${pct(lento.pct)} dos atendimentos demoram mais de um dia — é a faixa com NPS negativo.`);

  const naoFoi = d.motivo.find((m) => m.motivo.includes("Não fui"));
  if (naoFoi) itens.push(`"${naoFoi.motivo}" é o desfecho mais comum: ${pct(naoFoi.pct)} das respostas da janela.`);

  const cairam = d.regional.filter((r) => r.atual.n >= 10 && r.atual.tx < r.anterior.tx);
  if (cairam.length) itens.push(`${num(cairam.length)} regionais pioraram a taxa de contato na semana.`);

  const pior = d.piores[0];
  if (pior) itens.push(`${pior.nome} (DN ${pior.dn}) tem ${pct(pior.tx)} de contato em ${num(pior.n)} respostas.`);

  return itens;
}

/** Onde a venda escapa, em uma frase. Só motivo — a marca fica em `paraQuem()`,
 *  que tem amostra muito menor e não pode contaminar esta leitura. */
export function ondePerdemos(d: Dados) {
  const naoFoi = d.motivo.find((m) => m.motivo.includes("Não fui"));
  const desistiu = d.motivo.find((m) => m.motivo.includes("Desisti"));
  const outra = d.motivo.find((m) => m.motivo.includes("outra marca"));
  const partes: string[] = [];
  if (naoFoi) partes.push(`${pct(naoFoi.pct)} nunca chegou na concessionária`);
  if (desistiu) partes.push(`${pct(desistiu.pct)} desistiu de comprar`);
  if (outra) partes.push(`${pct(outra.pct)} comprou de outra marca`);
  return `Das ${num(d.totalMotivo)} respostas com desfecho, ${partes.join(", ")}. A perda mora antes da loja: quem some no caminho é ${
    naoFoi && outra ? num(Math.round(naoFoi.n / Math.max(outra.n, 1))) : "vários"
  }× mais comum que quem escolheu outra marca.`;
}

/** Para quem a venda vai. Só conta quem nomeou a marca — minoria de quem
 *  declarou "comprei de outra marca", por isso a frase dá os dois números.
 *  "Nova" exige semana anterior na janela: na primeira, toda marca seria nova. */
export function paraQuem(d: Dados) {
  const c = d.concorrencia;
  const total = c.janela.reduce((a, b) => a + b.n, 0);
  if (!total) return "Nenhum cliente nomeou a marca concorrente nesta janela.";
  const declarados = d.motivo.find((m) => m.motivo.includes("outra marca"))?.n ?? 0;
  const topo = c.janela.slice(0, 4).map((m) => `${m.marca} ${num(m.n)}`);
  const resto = c.janela.slice(4);
  if (resto.length) topo.push(`outras ${num(resto.length)} somam ${num(resto.reduce((a, b) => a + b.n, 0))}`);
  const novas =
    d.periodo.semanasJanela > 1 && c.novasSemana.length
      ? ` Sem registro antes desta semana: ${c.novasSemana.join(", ")}.`
      : "";
  return `Para quem: ${topo.join(", ")} — ${num(total)} dos ${num(declarados)} que compraram de outra marca disseram qual.${novas}`;
}

/** A correlação que o relatório existe para mostrar. Monotônica ou não, o texto
 *  diz o que o dado diz — se a escada quebrar, a frase muda junto. */
export function correlacaoNpsTempo(d: Dados) {
  const t = d.npsTempo;
  if (t.length < 2) return `Amostra insuficiente para relacionar NPS e tempo de atendimento nesta janela.`;
  const rapido = t.find((x) => x.tempo === "Até 30 minutos");
  const lento = t.find((x) => x.tempo === "Mais de um dia");
  if (!rapido || !lento) return `As faixas extremas de tempo não têm amostra suficiente nesta janela.`;

  const ordem = ["Até 30 minutos", "Até duas horas", "Até um dia", "Mais de um dia"];
  const seq = ordem.map((o) => t.find((x) => x.tempo === o)).filter(Boolean) as typeof t;
  const monotonica = seq.every((x, i) => i === 0 || x.nps <= seq[i - 1]!.nps);
  const dif = rapido.nps - lento.nps;

  return `${monotonica ? "Cada faixa de espera derruba o NPS" : "A relação entre espera e NPS não é limpa nesta janela"}: ${num(
    rapido.nps,
    1,
  )} em até 30 minutos contra ${num(lento.nps, 1)} em mais de um dia, ${num(dif, 1)} pontos de diferença${
    lento.nps < 0 ? " — a faixa mais lenta já é detratora na média" : ""
  }.`;
}

/** O que aprendi — as conclusões acionáveis, todas derivadas. */
export function oQueAprendi(d: Dados): { titulo: string; texto: string }[] {
  const itens: { titulo: string; texto: string }[] = [];

  const lento = d.tempo.find((t) => t.tempo === "Mais de um dia");
  const rapido = d.npsTempo.find((x) => x.tempo === "Até 30 minutos");
  const devagar = d.npsTempo.find((x) => x.tempo === "Mais de um dia");
  if (lento && rapido && devagar)
    itens.push({
      titulo: "A primeira hora decide a satisfação",
      texto: `${pct(lento.pct)} dos atendimentos passam de um dia, e é exatamente a faixa que puxa o NPS para ${num(
        devagar.nps,
        1,
      )}. Mover esses contatos para a janela de 30 minutos vale ${num(rapido.nps - devagar.nps, 1)} pontos de NPS.`,
    });

  const naoFoi = d.motivo.find((m) => m.motivo.includes("Não fui"));
  if (naoFoi)
    itens.push({
      titulo: "A perda acontece antes da loja",
      texto: `O desfecho mais comum é o cliente que nunca foi à concessionária (${pct(
        naoFoi.pct,
      )}). Não é disputa com concorrente: é lead que esfria entre o cadastro e a visita.`,
    });

  const origem = d.origem[0];
  if (origem)
    itens.push({
      titulo: `${origem.origem} concentra o não-contato`,
      texto: `${num(origem.semContato)} das respostas sem contato vêm dessa origem, com taxa de ${pct(
        origem.tx,
      )} em ${num(origem.n)} respostas. É onde uma correção de fila rende mais.`,
    });

  const piorReg = [...d.regional].filter((r) => r.atual.n >= 10).sort((a, b) => a.atual.tx - b.atual.tx)[0];
  if (piorReg)
    itens.push({
      titulo: `Regional ${piorReg.regional} é a ponta mais fraca`,
      texto: `${pct(piorReg.atual.tx)} de contato em ${num(piorReg.atual.n)} respostas nesta semana, contra ${pct(
        piorReg.anterior.tx,
      )} na anterior. ${num(piorReg.atual.perdas)} vendas perdidas estimadas na amostra ouvida.`,
    });

  return itens;
}

// ══ acumulado do mês ══════════════════════════════════════════════════════

/** Intervalo legível: "01/08/2026 a 23/08/2026". */
export const rotuloIntervalo = (ini: string, fim: string) => `${dia(ini)} a ${dia(fim)}`;

/** O recorte do mês anterior só vira comparação se tiver amostra para isso.
 *  A auditoria trabalha em mutirão: um mês inteiro pode vir sem resposta, e aí
 *  a queda de 54% para 0% seria cobertura, não desempenho. */
const antesDaMudanca = (d: Dados) => d.mes.antInicio < d.periodo.inicioQuestionario;
export const mesComparavel = (d: Dados) => !antesDaMudanca(d) && d.mes.anterior.nContato >= 10;

/** Por que não há comparação — o leitor precisa saber que é o questionário, não queda de auditoria. */
const semComparacao = (d: Dados) =>
  antesDaMudanca(d)
    ? `O mesmo recorte do mês anterior é de antes da mudança do questionário (${dia(d.periodo.inicioQuestionario)}) e não entra na comparação.`
    : `O mesmo recorte do mês anterior não tem auditoria suficiente para comparar.`;

export function subtituloMes(d: Dados) {
  const m = d.mes;
  const base = `Auditorias realizadas de ${rotuloIntervalo(m.inicio, m.fim)} — ${num(m.dias)} dias, até o domingo da semana acima.`;
  return mesComparavel(d)
    ? `${base} Comparado com ${rotuloIntervalo(m.antInicio, m.antFim)}, o mesmo recorte de dias do mês anterior${
        m.dias === m.diasAnt ? "" : ` (${num(m.diasAnt)} dias — o mês anterior é mais curto)`
      }.`
    : `${base} ${semComparacao(d)}`;
}

export function vereditoMes(d: Dados) {
  const m = d.mes;
  const volume = `${num(m.atual.nContato)} respostas de contato e ${num(m.atual.nNps)} avaliações de NPS em ${num(
    m.dias,
  )} dias.`;

  if (!mesComparavel(d))
    return `No mês, a taxa de contato está em ${pct(m.atual.txContato)} — ${volume} Sem recorte comparável no mês anterior, o número do mês vale como nível, não como evolução.`;

  const v = delta(m.atual.txContato, m.anterior.txContato);
  return `No mês, a taxa de contato ${v.verbo} de ${pct(m.anterior.txContato)} para ${pct(m.atual.txContato)} — ${pp(
    v.dif,
  )} sobre o mesmo recorte de dias. ${volume}`;
}

/** O acumulado responde o que a semana não sustenta: se o movimento da semana é
 *  ruído ou tendência. Cada item só entra com o dado do lado. */
export function oQueOMesMostra(d: Dados): string[] {
  const m = d.mes;
  const itens: string[] = [];

  if (mesComparavel(d)) {
    // A pergunta que o acumulado existe para responder: a semana concorda com
    // o mês, ou o movimento semanal é oscilação de ~150 respostas?
    const sem = delta(d.atual.txContato, d.anterior.txContato);
    const mes = delta(m.atual.txContato, m.anterior.txContato);
    if (!sem.parado && !mes.parado)
      itens.push(
        sem.bom === mes.bom
          ? `A semana e o mês apontam para o mesmo lado: contato ${sem.verbo} nos dois recortes (${pp(sem.dif)} na semana, ${pp(
              mes.dif,
            )} no mês).`
          : `A semana ${sem.verbo} (${pp(sem.dif)}) contra um mês que ${mes.verbo} (${pp(
              mes.dif,
            )}) — o movimento da semana ainda não virou tendência.`,
      );

    const nps = delta(m.atual.npsGeral, m.anterior.npsGeral);
    if (!nps.parado)
      itens.push(
        `NPS do mês ${nps.verbo} de ${num(m.anterior.npsGeral, 1)} para ${num(m.atual.npsGeral, 1)}, sobre ${num(
          m.atual.nNps,
        )} avaliações — amostra ${num(Math.round(m.atual.nNps / Math.max(d.atual.nNps, 1)))}× a da semana.`,
      );

    const conv = delta(m.atual.txVendas, m.anterior.txVendas);
    if (!conv.parado)
      itens.push(
        `Conversão dos auditados ${conv.verbo} de ${pct(m.anterior.txVendas)} para ${pct(m.atual.txVendas)}: ${num(
          m.atual.vendas,
        )} vendas em ${num(m.atual.auditados)} auditorias no mês.`,
      );
  }

  itens.push(
    `${num(m.atual.semContato)} clientes do mês declararam que ninguém os procurou — ${num(
      m.atual.perdas,
    )} vendas perdidas estimadas na amostra ouvida (${rs(m.atual.faturamentoPerdido)}).`,
  );

  const piorReg = [...m.regional].filter((r) => r.atual.n >= 10).sort((a, b) => a.atual.tx - b.atual.tx)[0];
  if (piorReg)
    itens.push(
      `No acumulado, a regional ${piorReg.regional} fecha o mês em ${pct(piorReg.atual.tx)} de contato sobre ${num(
        piorReg.atual.n,
      )} respostas — amostra que a leitura semanal não tem.`,
    );

  return itens;
}

/** Perdas em unidades e em R$, sempre dizendo que é a amostra ouvida — a regra
 *  de ouro deste cliente é nunca multiplicar percentual de amostra por base. */
export function vereditoPerdas(d: Dados) {
  const v = delta(d.atual.perdas, d.anterior.perdas, false);
  return `Semana: ${num(d.atual.perdas)} vendas perdidas (${num(d.atual.perdasAtendimento)} sem contato, ${num(
    d.atual.perdasConcorrencia,
  )} outra marca), ${rs(d.atual.faturamentoPerdido)} — ${v.verbo} contra ${num(d.anterior.perdas)}. Dentro dos ${num(
    d.atual.nContato,
  )} clientes ouvidos, não projeção da rede.`;
}
