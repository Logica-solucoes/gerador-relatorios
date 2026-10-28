import type { Dados } from "./queries";
import { PISO_AMOSTRA, TICKET_MEDIO } from "./queries";
import { num, pct } from "../../core/report";
import * as n from "./narrativa";

// Ponto de partida para o chatbot ("como estamos essa semana?"), nunca renderizado.
// O chatbot tem acesso ao banco: o que importa aqui são as manchetes e a definição
// de cada número, para a consulta de aprofundamento usar o mesmo recorte do relatório.

const semTags = (s: string) => s.replace(/<[^>]+>/g, "");

/** "(subiu 3,1 p.p. vs. semana anterior)" — a direção em palavra, sem depender de seta. */
function variacao(atual: number, anterior: number, unidade: string, casas = 1) {
  const dif = atual - anterior;
  if (Math.abs(dif) < 0.05) return "(estável vs. semana anterior)";
  return `(${dif > 0 ? "subiu" : "caiu"} ${num(Math.abs(dif), casas)}${unidade} vs. semana anterior)`;
}

const linhas = (itens: string[], vazio: string) => (itens.length ? itens.map((i) => `- ${semTags(i)}`) : [`- ${vazio}`]);

export function resumo(d: Dados): string {
  const a = d.atual;
  const b = d.anterior;
  const regionais = [...d.regional].filter((r) => r.atual.n >= PISO_AMOSTRA).sort((x, y) => y.atual.tx - x.atual.tx);
  const melhor = regionais[0];
  const pior = regionais.length > 1 ? regionais.at(-1) : undefined;

  const mes = d.mes;
  const mesLinhas = n.mesComparavel(d)
    ? [n.vereditoMes(d), ...n.oQueOMesMostra(d).slice(0, 2)]
    : [n.vereditoMes(d)];

  return [
    "CONTEXTO INICIAL — Auditoria de Leads Volkswagen, acompanhamento semanal",
    "",
    `Semana lida: ${n.rotuloSemana(d.periodo.atual)} (segunda a domingo). Semana anterior: ${n.rotuloSemana(d.periodo.anterior)}.`,
    `Mês acumulado: ${n.rotuloIntervalo(mes.inicio, mes.fim)}.`,
    "",
    "INDICADORES DA SEMANA",
    `- Taxa de contato: ${pct(a.txContato)} ${variacao(a.txContato, b.txContato, " p.p.")} — ${num(a.nContato)} respostas, ${num(a.semContato)} disseram que ninguém os procurou.`,
    `- Vendas perdidas: ${num(a.perdas)} ${variacao(a.perdas, b.perdas, "", 0)} — ${num(a.perdasAtendimento)} por falta de contato e ${num(a.perdasConcorrencia)} para outra marca; R$ ${num(a.faturamentoPerdido / 1e6, 1)} mi estimados.`,
    `- NPS: ${num(a.npsGeral, 1)} ${variacao(a.npsGeral, b.npsGeral, " pts")} — ${num(a.nNps)} avaliações.`,
    `- Conversão dos auditados: ${pct(a.txVendas)} ${variacao(a.txVendas, b.txVendas, " p.p.")} — ${num(a.vendas)} vendas em ${num(a.auditados)} auditorias.`,
    "",
    "TENDÊNCIA",
    `- ${semTags(n.tendencia(d))}`,
    "",
    "O QUE ESTÁ BOM",
    ...linhas(n.oQueEstaBom(d).slice(0, 4), "nenhum indicador melhorou o suficiente nesta semana."),
    "",
    "O QUE ESTÁ RUIM",
    ...linhas(n.oQueEstaRuim(d).slice(0, 4), "nenhum indicador acendeu alerta nesta semana."),
    "",
    "REGIONAIS (taxa de contato na semana, só com amostra suficiente)",
    melhor && pior
      ? `- Melhor: R${melhor.regional}, ${pct(melhor.atual.tx)} em ${num(melhor.atual.n)} respostas. Pior: R${pior.regional}, ${pct(pior.atual.tx)} em ${num(pior.atual.n)} respostas.`
      : `- Nenhuma regional com ${PISO_AMOSTRA} respostas ou mais para comparar.`,
    "",
    `ONDE PERDEMOS (últimas ${num(d.periodo.semanasJanela)} semanas, ${n.rotuloIntervalo(d.periodo.janelaInicio, d.periodo.fim)})`,
    `- ${semTags(n.ondePerdemos(d))}`,
    "",
    "MÊS ATÉ AQUI",
    ...mesLinhas.map((l) => `- ${semTags(l)}`),
    "",
    "COMO OS NÚMEROS SÃO CALCULADOS (use o mesmo recorte ao consultar o banco)",
    "- Todo recorte é pela data da auditoria (coluna `data`, em CAST AS DATE), não pela data de criação do lead (`dt_criacao`). Por isso os números não batem com o dashboard de auditoria para a mesma semana, e é esperado.",
    "- Fonte: vw_volks_leads_auditados com auditado = 'Sim'. Nada antes de 17/08/2026 entra: foi quando a pergunta do questionário mudou.",
    "- Taxa de contato = respostas 'Sim' sobre 'Sim' + 'Não' na coluna contato. O mês compara o mesmo recorte de dias do mês anterior, nunca o mês fechado.",
    `- Vendas perdidas são estimativa sobre a amostra ouvida pela auditoria, não projeção da rede; usa ticket médio de R$ ${num(TICKET_MEDIO / 1000, 0)} mil, que é premissa fixa. Nunca multiplique percentual da amostra pelo volume da base.`,
    `- Recorte com menos de ${PISO_AMOSTRA} respostas tem amostra baixa e não sustenta leitura.`,
  ].join("\n");
}
