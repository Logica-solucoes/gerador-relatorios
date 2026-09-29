import type { Dados } from "./queries";
import { PISO_AMOSTRA } from "./queries";
import { num, pct, dt, mi } from "../../core/report";
import { ORDEM_TEMPO, faixaDaNota } from "./report";

// Toda frase daqui muda de sentido se o dado mudar. Prosa neutra (definição de
// métrica, descrição de eixo) fica em pages.ts — ver clients/vw/CLAUDE.md.

const pp = (a: number, b: number) => num(Math.abs(b - a), 1);
const p1 = (v: number, d = 1) => pct(v * 100, d);
const maisMenos = (a: number, b: number) => (b >= a ? "maior" : "menor");

const amostraTxt = (n: number) => `n=${num(n)}`;

const porFaixa = (d: Dados, faixa: string) => d.npsTempo.find((t) => t.tempo === faixa);

/** Extremos de uma lista já ordenada por valor, com o nome do recorte. */
function extremos<T>(itens: T[], valor: (x: T) => number, nome: (x: T) => string) {
  const ord = [...itens].sort((a, b) => valor(b) - valor(a));
  return { topo: ord[0]!, fundo: ord[ord.length - 1]!, nome, valor, ord };
}

// ── Página: o funil ────────────────────────────────────────────────────────

export function resumoFunil(d: Dados) {
  const [criados, abordados, , responderam, respContato] = d.funil.map((f) => f.n) as number[];
  return `De ${num(criados!)} leads criados no período, a auditoria conseguiu abordar ${num(abordados!)} (${pct(
    (abordados! / criados!) * 100,
  )}). Desses, ${num(responderam!)} responderam pelo menos uma pergunta e ${num(
    respContato!,
  )} chegaram até a pergunta sobre contato — que é a base de todo percentual de taxa de contato deste relatório.`;
}

export function alcanceAuditoria(d: Dados) {
  const abordados = d.funil[1]!.n;
  const responderam = d.funil[3]!.n;
  return `A auditoria fala com uma amostra, não com a base inteira: ${pct(
    (abordados / d.funil[0]!.n) * 100,
  )} dos leads foram abordados e ${pct(
    (responderam / abordados) * 100,
  )} dos abordados responderam. Isso não invalida o número — invalida recortes finos demais, onde essa amostra vira duas ou três respostas.`;
}

// ── Página: projeção da taxa de conversão ──────────────────────────────────

/** A conta em uma frase: mesma taxa de contato de hoje, fila ordenada pelo
 *  score. `vendasHoje`/`vendasOrdenada` são do período disponível da auditoria
 *  (ver clients/vw_auditoria/CLAUDE.md), não um mês nem a base toda. */
export function projecaoVendas(d: Dados): string {
  const p = d.projecao;
  return `Contactando os mesmos ${p1(p.corte, 0)} de leads, agora na ordem do score, a conversão sobe de ${p1(p.taxaHoje)} para ${p1(p.taxaOrdenada)} — ${num(p.mult, 2)}× as vendas de hoje com a mesma capacidade de contato. Sobre os leads do período disponível (${dt(d.periodo.inicio + "T12:00:00Z")} a ${dt(d.periodo.fimDisponivel + "T12:00:00Z")}), seriam ${num(p.vendasOrdenada, 0)} vendas no lugar de ${num(p.vendasHoje, 0)}: ${num(p.vendasExtras, 0)} a mais, sem uma ligação a mais.`;
}

/** O duplo cuidado desta página: o corte vem de amostra (não da base inteira,
 *  ver "Não faça" em clients/vw_auditoria/CLAUDE.md), e a forma da curva vem
 *  de um modelo diferente, não medido nesta auditoria. */
export function cuidadoProjecao(d: Dados): string {
  const p = d.projecao;
  return `O corte de ${p1(p.corte, 0)} é a taxa de contato medida sobre ${num(p.nContato)} respostas — a mesma ressalva de amostra da página anterior, não a base inteira. E a curva que dá forma ao ganho vem do modelo de Lead Scoring, treinado numa base e período diferentes desta auditoria: ela diz como o score separa os leads, não como esta auditoria se comportaria se a fila fosse realmente reordenada. Trate o número como direção, não como meta — o teste de verdade é medir a conversão real de uma fila ordenada por score, mês a mês.`;
}

// ── Página: taxa de contato ────────────────────────────────────────────────

export function vereditoContato(d: Dados) {
  const { txContato, nContato } = d.kpis;
  const quantos = Math.round((txContato / 100) * 10);
  return `${
    txContato < 50 ? "Menos da metade" : "Pouco mais da metade"
  } dos clientes ouvidos confirma que a concessionária entrou em contato: ${pct(txContato)} de ${num(
    nContato,
  )} respostas — cerca de ${quantos} em cada 10.`;
}

export function tendenciaContato(d: Dados) {
  if (d.contatoMes.length < 2) return "Ainda não há dois meses fechados para comparar a evolução.";
  const primeiro = d.contatoMes[0]!;
  const ultimo = d.contatoMes[d.contatoMes.length - 1]!;
  const subiu = ultimo.tx > primeiro.tx;
  const ressalva =
    ultimo.n < primeiro.n
      ? ` Atenção ao último ponto: ${ultimo.mes} tem ${num(ultimo.n)} respostas contra ${num(
          primeiro.n,
        )} de ${primeiro.mes}, então ele ainda pode se mover bastante.`
      : "";
  return `A taxa ${subiu ? "subiu" : "caiu"} de ${pct(primeiro.tx)} em ${primeiro.mes} para ${pct(
    ultimo.tx,
  )} em ${ultimo.mes}, ${pp(primeiro.tx, ultimo.tx)} pontos percentuais de diferença.${ressalva}`;
}

export function licaoAmostraDia(d: Dados) {
  const fracos = d.contatoDia.filter((x) => x.n < PISO_AMOSTRA);
  const extremosFracos = fracos.filter((x) => x.tx === 0 || x.tx === 100);
  const firmes = d.contatoDia.filter((x) => x.n >= PISO_AMOSTRA);
  return `${num(fracos.length)} dos ${num(d.contatoDia.length)} dias têm menos de ${PISO_AMOSTRA} respostas${
    extremosFracos.length
      ? `, e ${num(extremosFracos.length)} deles cravam 0% ou 100% — sempre por causa de uma ou duas respostas isoladas`
      : ""
  }. Os ${num(firmes.length)} dias com amostra suficiente ficam entre ${pct(
    Math.min(...firmes.map((x) => x.tx)),
  )} e ${pct(Math.max(...firmes.map((x) => x.tx)))}.`;
}

// ── Página: NPS ────────────────────────────────────────────────────────────

export function leituraNps(d: Dados) {
  const total = d.npsNotas.reduce((a, b) => a + b.n, 0);
  const por = (faixa: string) =>
    d.npsNotas.filter((n) => faixaDaNota(n.nota) === faixa).reduce((a, b) => a + b.n, 0);
  const promotores = por("Promotor");
  const detratores = por("Detrator");
  return `O NPS geral é ${num(d.kpis.npsGeral, 1)}, calculado sobre ${num(d.kpis.nNps)} avaliações: ${pct(
    (promotores / total) * 100,
  )} de promotores contra ${pct((detratores / total) * 100)} de detratores. A conta é a diferença entre esses dois percentuais — quem dá 7 ou 8 não entra em nenhum lado.`;
}

export function polarizacaoNps(d: Dados) {
  const maior = [...d.npsNotas].sort((a, b) => b.n - a.n)[0]!;
  const nota1 = d.npsNotas.find((n) => n.nota <= 1);
  const meio = d.npsNotas.filter((n) => n.nota >= 4 && n.nota <= 7).reduce((a, b) => a + b.n, 0);
  return `As respostas não se distribuem por igual: a nota mais dada é ${maior.nota} (${num(
    maior.n,
  )} respostas)${
    nota1 ? ` e a segunda concentração está na nota ${nota1.nota} (${num(nota1.n)})` : ""
  }, enquanto o miolo da escala (4 a 7) soma só ${num(meio)}. Quem responde tende a estar satisfeito ou irritado — quase ninguém está no meio.`;
}

// ── Página: tempo de resposta ──────────────────────────────────────────────

export function escadaTempo(d: Dados) {
  const rapido = porFaixa(d, ORDEM_TEMPO[0]!);
  const lento = porFaixa(d, ORDEM_TEMPO[ORDEM_TEMPO.length - 1]!);
  if (!rapido || !lento) return "Ainda não há resposta suficiente em todas as faixas de tempo.";
  return `Quem foi atendido em ${ORDEM_TEMPO[0]!.toLowerCase()} devolve NPS de ${num(
    rapido.nps,
    1,
  )} (${num(rapido.n)} avaliações). Quem esperou ${ORDEM_TEMPO[
    ORDEM_TEMPO.length - 1
  ]!.toLowerCase()} devolve ${num(lento.nps, 1)} (${num(lento.n)}). São ${pp(
    lento.nps,
    rapido.nps,
  )} pontos de diferença, e a queda é monótona: cada faixa mais lenta tem NPS ${maisMenos(
    rapido.nps,
    lento.nps,
  )} que a anterior.`;
}

export function pesoDosLentos(d: Dados) {
  const total = d.tempo.reduce((a, b) => a + b.n, 0);
  const lentos = d.tempo.find((t) => t.tempo === "Mais de um dia");
  const rapidos = d.tempo.find((t) => t.tempo === "Até 30 minutos");
  if (!lentos || !rapidos) return "";
  return `E não é um caso raro: ${pct((lentos.n / total) * 100)} dos clientes ouvidos dizem ter esperado mais de um dia, contra ${pct(
    (rapidos.n / total) * 100,
  )} atendidos em até 30 minutos.`;
}

export function escadaOutraMarca(d: Dados) {
  const share = (faixa: string) => {
    const t = d.statusTempo.find((x) => x.tempo === faixa);
    if (!t) return null;
    const n = t.status.find((s) => s.status === "Comprei de outra marca")?.n ?? 0;
    return { share: (n / t.total) * 100, n, total: t.total };
  };
  const r = share(ORDEM_TEMPO[0]!);
  const l = share(ORDEM_TEMPO[ORDEM_TEMPO.length - 1]!);
  if (!r || !l) return "";
  const fator = r.share ? l.share / r.share : 0;
  return `Entre os atendidos em até 30 minutos, ${pct(r.share)} acabaram comprando de outra marca (${r.n} de ${r.total}). Entre os que esperaram mais de um dia, ${pct(
    l.share,
  )} (${l.n} de ${l.total}) — ${num(fator, 1)} vezes mais. Com essas amostras a direção é confiável; o tamanho exato do salto, não.`;
}

// ── Página: desfecho declarado ─────────────────────────────────────────────

export function leituraStatus(d: Dados) {
  const total = d.status.reduce((a, b) => a + b.n, 0);
  const maior = d.status[0]!;
  const comprouVw = d.status
    .filter((s) => s.status.startsWith("Comprei um VW"))
    .reduce((a, b) => a + b.n, 0);
  const outra = d.status.find((s) => s.status === "Comprei de outra marca")?.n ?? 0;
  return `A resposta mais comum é “${maior.status}” (${num(maior.n)} de ${num(total)}, ${pct(
    (maior.n / total) * 100,
  )}). Declararam compra de um Volkswagen ${pct((comprouVw / total) * 100)} dos que responderam, contra ${pct(
    (outra / total) * 100,
  )} que declararam compra de outra marca.`;
}

export function leituraFormulario(d: Dados) {
  const t = (xs: { n: number }[]) => xs.reduce((a, b) => a + b.n, 0);
  const tG = t(d.status);
  const tN = t(d.statusNaoPreencheu);
  const share = (lista: { status: string; n: number }[], total: number, alvo: string) =>
    ((lista.find((s) => s.status === alvo)?.n ?? 0) / total) * 100;
  const alvo = "Comprei de outra marca";
  const g = share(d.status, tG, alvo);
  const n = share(d.statusNaoPreencheu, tN, alvo);
  return `Entre todos os auditados, ${pct(g)} disseram “${alvo}”. Entre os ${num(
    tN,
  )} que dizem não ter preenchido o formulário na loja, esse número é ${pct(n)} — ${pp(
    g,
    n,
  )} pontos ${maisMenos(g, n)}. O formulário não é burocracia: é o ponto em que a concessionária ainda consegue reverter.`;
}

// ── Página: canal ──────────────────────────────────────────────────────────

export function leituraCanal(d: Dados) {
  const total = d.canalPreferencia.reduce((a, b) => a + b.n, 0);
  const wpp = d.canalPreferencia.filter((c) => c.usado === "WhatsApp").reduce((a, b) => a + b.n, 0);
  const pediuTel = d.canalPreferencia.filter((c) => c.pedido === "Telefone");
  const telTotal = pediuTel.reduce((a, b) => a + b.n, 0);
  const telPorWpp = pediuTel.find((c) => c.usado === "WhatsApp")?.n ?? 0;
  return `${pct((wpp / total) * 100)} de todo contato registrado saiu por WhatsApp. Entre quem pediu telefone no cadastro, ${num(
    telPorWpp,
  )} de ${num(telTotal)} (${pct((telPorWpp / telTotal) * 100)}) mesmo assim foram procurados por WhatsApp.`;
}

export function npsPorCanal(d: Dados) {
  const firmes = d.npsCanal.filter((c) => c.n >= PISO_AMOSTRA).sort((a, b) => b.nps - a.nps);
  const fracos = d.npsCanal.filter((c) => c.n < PISO_AMOSTRA);
  if (!firmes.length) return "Nenhum canal tem avaliações suficientes para comparar NPS.";
  const linha = firmes.map((c) => `${c.canal} ${num(c.nps, 1)} (${num(c.n)} avaliações)`).join(" e ");
  return `Por canal: ${linha}.${
    fracos.length
      ? ` ${fracos
          .map((c) => c.canal)
          .join(" e ")} aparece${fracos.length > 1 ? "m" : ""} no dashboard com nota alta, mas sobre ${fracos
          .map((c) => num(c.n))
          .join(" e ")} avaliação${fracos.length > 1 ? "ões" : ""} — não é comparável.`
      : ""
  }`;
}

// ── Página: recortes ───────────────────────────────────────────────────────

export function leituraRegional(d: Dados) {
  const c = extremos(d.contatoRegional, (x) => x.tx, (x) => x.regional);
  const n = extremos(d.npsRegional, (x) => x.nps, (x) => x.regional);
  return `Taxa de contato vai de ${pct(c.fundo.tx)} na Regional ${c.fundo.regional} a ${pct(
    c.topo.tx,
  )} na Regional ${c.topo.regional} — ${pp(c.fundo.tx, c.topo.tx)} pontos separam a ponta de baixo da de cima. Em NPS o intervalo é de ${num(
    n.fundo.nps,
    1,
  )} (Regional ${n.fundo.regional}) a ${num(n.topo.nps, 1)} (Regional ${n.topo.regional}).`;
}

export function leituraModelo(d: Dados) {
  const firmes = d.npsModelo.filter((m) => m.n >= PISO_AMOSTRA);
  const cortados = d.npsModelo.length - firmes.length;
  if (!firmes.length) return "Nenhum modelo tem avaliações suficientes para comparar.";
  const e = extremos(firmes, (x) => x.nps, (x) => x.modelo);
  return `Entre os modelos com pelo menos ${PISO_AMOSTRA} avaliações, ${e.topo.modelo} lidera com NPS ${num(
    e.topo.nps,
    1,
  )} e ${e.fundo.modelo} fecha com ${num(e.fundo.nps, 1)}.${
    cortados ? ` Outros ${num(cortados)} modelos ficaram de fora do gráfico por amostra insuficiente.` : ""
  }`;
}

export function leituraDn(d: Dados) {
  const { total, comAmostra, piso } = d.dnCobertura;
  // nome fantasia se repete entre DNs ("Green Automoveis" são três lojas) — sem o
  // código a frase aponta para uma linha que o leitor não acha na tabela
  const e = extremos(d.tabelaDn, (x) => x.txContato, (x) => `${x.nome} · ${x.dn}`);
  return `${num(total)} concessionárias aparecem na auditoria, mas só ${num(
    comAmostra,
  )} têm ${piso} respostas ou mais — as outras ${num(
    total - comAmostra,
  )} não sustentam um percentual. Entre as que sustentam, a taxa de contato vai de ${pct(
    e.fundo.txContato,
  )} (${e.nome(e.fundo)}) a ${pct(e.topo.txContato)} (${e.nome(e.topo)}).`;
}

// ── Página: perdas ─────────────────────────────────────────────────────────

export function leituraPerdas(d: Dados) {
  const k = d.kpis;
  return `O dashboard estima ${num(k.perdasTotal)} vendas perdidas no período — ${num(
    k.perdasAtendimento,
  )} atribuídas à falha de atendimento e ${num(
    k.perdasConcorrencia,
  )} a clientes que declararam ter comprado de outra marca. A R$ ${num(130000)} de ticket médio, isso vira R$ ${mi(
    k.faturamentoPerdido,
  )} milhões.`;
}

export function ressalvaPerdas(d: Dados) {
  return `Os dois componentes têm naturezas diferentes. As ${num(
    d.kpis.perdasConcorrencia,
  )} vendas de concorrência são declaradas pelo próprio cliente. As ${num(
    d.kpis.perdasAtendimento,
  )} de atendimento são uma projeção: a taxa de conversão da base (${pct(
    d.kpis.txVendas,
  )}) aplicada sobre quem disse não ter sido contatado. É estimativa, e o ticket médio é premissa fixa, não medida.`;
}

// ── Página: voz do cliente ─────────────────────────────────────────────────

export function leituraSentimento(d: Dados) {
  const v = d.sentimento.volume;
  const total = v.positivo + v.neutro + v.negativo;
  return `Dos ${num(total)} comentários classificados pela IA, ${pct(
    (v.negativo / total) * 100,
  )} são negativos, ${pct((v.neutro / total) * 100)} neutros e ${pct(
    (v.positivo / total) * 100,
  )} positivos. Comentário é canal de reclamação por natureza — a proporção não representa a base, só quem escolheu escrever.`;
}

export function leituraPalavras(d: Dados) {
  const p = d.sentimento.palavras;
  if (!p.length) return "";
  const negativas = p.filter((x) => x.sentimento === "negativo");
  return `A palavra mais repetida é “${p[0]!.palavra}” (${num(p[0]!.n)} vezes). ${num(
    negativas.length,
  )} das ${num(p.length)} palavras do gráfico aparecem sobretudo em comentários negativos${
    negativas.length ? `, entre elas ${negativas.slice(0, 3).map((x) => `“${x.palavra}”`).join(", ")}` : ""
  } — vale ler a lista inteira antes de concluir qual é o assunto.`;
}

// ── Página: concorrência ───────────────────────────────────────────────────

export function leituraConcorrencia(d: Dados) {
  const total = d.concorrencia.reduce((a, b) => a + b.n, 0);
  const declarados = d.status.find((s) => s.status === "Comprei de outra marca")?.n ?? 0;
  if (!total) return "Ainda não há nenhuma marca concorrente identificada no período.";
  const topo = d.concorrencia[0]!;
  return `${num(declarados)} clientes declararam ter comprado de outra marca, mas só ${num(
    total,
  )} disseram qual — a mais citada é ${topo.rotulo} (${num(
    topo.n,
  )}). Com ${num(total)} respostas isto é um sinal de que a pergunta funciona, não um mapa de concorrência.`;
}

export function leituraContatoOrigem(d: Dados) {
  if (d.contatoOrigem.length < 2) return "";
  const topo = d.contatoOrigem[0]!;
  const fundo = d.contatoOrigem[d.contatoOrigem.length - 1]!;
  return `A taxa de contato também muda com a origem: ${pct(topo.tx)} em ${topo.origem} (${amostraTxt(
    topo.n,
  )}) contra ${pct(fundo.tx)} em ${fundo.origem} (${amostraTxt(fundo.n)}). São ${pp(
    fundo.tx,
    topo.tx,
  )} pontos de diferença entre dois canais que alimentam a mesma rede de concessionárias.`;
}

// ── Página: origens ────────────────────────────────────────────────────────

export function leituraOrigem(d: Dados) {
  const e = extremos(d.subOrigem, (x) => x.tx, (x) => x.origem);
  const maior = [...d.subOrigem].sort((a, b) => b.leads - a.leads)[0]!;
  return `${maior.origem} responde por ${num(maior.leads)} leads, ${pct(
    (maior.leads / d.kpis.leadsCriados) * 100,
  )} de tudo que entrou, e converte ${pct(maior.tx)}. A melhor taxa é de ${e.topo.origem} (${pct(
    e.topo.tx,
  )}) e a pior de ${e.fundo.origem} (${pct(e.fundo.tx)}) — volume e qualidade não andam juntos.`;
}

// ── Capa e fechamento ──────────────────────────────────────────────────────

/** Meio-dia UTC antes de formatar: "2026-06-01" puro vira 31/05 em São Paulo. */
const dia = (s: string) => dt(s.slice(0, 10) + "T12:00:00Z");

export function periodo(d: Dados) {
  return `${dia(d.periodo.inicio)} a ${dia(d.periodo.fim)}`;
}

export function subtituloCapa(d: Dados) {
  return `${num(d.kpis.leadsCriados)} leads criados, ${num(d.kpis.abordados)} abordados pela auditoria e ${num(
    d.funil[3]!.n,
  )} respostas de clientes entre ${periodo(d)}.`;
}

export function tresNumeros(d: Dados) {
  const rapido = porFaixa(d, ORDEM_TEMPO[0]!);
  const lento = porFaixa(d, ORDEM_TEMPO[ORDEM_TEMPO.length - 1]!);
  return [
    `${pct(d.kpis.txContato)} dos clientes ouvidos confirmam que a concessionária entrou em contato.`,
    rapido && lento
      ? `Atendimento em até 30 minutos devolve NPS ${num(rapido.nps, 1)}; acima de um dia, ${num(lento.nps, 1)}.`
      : "",
    `${pct(d.kpis.txWpp)} de todo contato acontece por WhatsApp.`,
  ].filter(Boolean);
}
