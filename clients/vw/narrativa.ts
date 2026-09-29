/**
 * Texto que muda de sentido conforme os dados — nunca hardcoded (ver
 * clients/vw/CLAUDE.md, "Texto vs. dados").
 */
import type { Dados, Modelo } from "./queries";
import { capturaEm, faixaExibida, ganho, lift, TAXA_ATENDIMENTO } from "./queries";
import { num, pct } from "../../core/report";
import { rotulo } from "./report";

const p1 = (v: number, d = 1) => pct(v * 100, d);
const pp = (v: number, d = 1) => num(Math.abs(v) * 100, d) + " p.p.";

/** Manchete da capa: curta o bastante para caber em três linhas de h1. */
export function manchete(d: Pick<Dados, "base">): string {
  const c = capturaEm(d.base.faixas_score, TAXA_ATENDIMENTO);
  return `Os mesmos ${p1(TAXA_ATENDIMENTO, 0)} de leads atendidos hoje podem render ${p1(c)} das vendas.`;
}

/** A mesma ideia da manchete, desdobrada — usada no corpo, não no título. */
export function resumo(d: Pick<Dados, "base">): string {
  const c = capturaEm(d.base.faixas_score, TAXA_ATENDIMENTO);
  return `A auditoria mostrou que ${p1(TAXA_ATENDIMENTO, 0)} dos leads gerados recebem contato. Enquanto essa fila for atendida por ordem de chegada, ela entrega ${p1(TAXA_ATENDIMENTO, 0)} das vendas — nem mais, nem menos. Ordenada pelo score, a mesma fila entrega ${p1(c)}.`;
}

/**
 * O ganho no ponto de operação real do time. Não é uma meta contratada: é o corte
 * que já existe hoje, medido pela auditoria.
 */
export function ganhoAtendimento(d: Pick<Dados, "base">): string {
  const c = capturaEm(d.base.faixas_score, TAXA_ATENDIMENTO);
  return `Atendendo os mesmos ${p1(TAXA_ATENDIMENTO, 0)} de leads, mas do score mais quente para o mais frio, o time alcança ${p1(c)} das vendas em vez dos ${p1(TAXA_ATENDIMENTO, 0)} que uma fila sem critério entrega. São ${pp(c - TAXA_ATENDIMENTO)} de vendas que hoje ficam na mesa por causa da ordem de atendimento, não por falta de capacidade.`;
}

/**
 * De onde sai o número do corte de atendimento. As faixas são decis, então 45%
 * não é um ponto medido — é interpolação entre os dois decis vizinhos. Sem essa
 * frase o valor aparece do nada no meio da capa, que foi exatamente a reclamação
 * que originou esta função.
 */
export function procedenciaCaptura(d: Pick<Dados, "base">): string {
  const g = ganho(d.base.faixas_score);
  const i = g.findIndex((p) => p.pctBase >= TAXA_ATENDIMENTO);
  const antes = g[i - 1]!;
  const depois = g[i]!;
  return `Os ${p1(capturaEm(d.base.faixas_score, TAXA_ATENDIMENTO))} são a curva de ganho lida no corte de ${p1(TAXA_ATENDIMENTO, 0)}. Como as faixas são decis, esse corte não é um ponto medido: ele cai entre ${p1(antes.pctBase, 0)} da base — que concentra ${p1(antes.pctConv)} das vendas — e ${p1(depois.pctBase, 0)}, que concentra ${p1(depois.pctConv)}. O valor é a interpolação entre os dois.`;
}

/** O outro lado do mesmo número: quem não é atendido. */
export function naoAtendidos(d: Pick<Dados, "base">): string {
  const fora = 1 - TAXA_ATENDIMENTO;
  const perdidas = 1 - capturaEm(d.base.faixas_score, TAXA_ATENDIMENTO);
  return `Os ${p1(fora, 0)} de leads que ficam sem contato levam junto ${p1(fora, 0)} das vendas enquanto a escolha for por ordem de chegada. Com a fila ordenada pelo score, esse mesmo corte deixa de fora ${p1(perdidas)} — o modelo não aumenta a capacidade de atendimento, ele decide melhor quem entra nela.`;
}

/** Faixa de queda treino→OOT. Título e texto do card saem daqui, não do template. */
function faixaQueda(m: Modelo) {
  const q = m.metricas.treino.auc - m.metricas.oot.auc;
  if (q <= 0.06) return { q, i: 0 } as const;
  if (q <= 0.12) return { q, i: 1 } as const;
  return { q, i: 2 } as const;
}

export function tituloEstabilidade(m: Modelo): string {
  return ["O modelo se sustenta no tempo", "Há memorização, mas o OOT sustenta o uso", "O treino não se repete no tempo"][faixaQueda(m).i]!;
}

/** Quanto o modelo perde do treino para o teste no tempo — leitura de overfitting. */
export function estabilidade(m: Modelo): string {
  const veredito = [
    "queda pequena: o modelo generalizou, não decorou o treino",
    "queda moderada: há alguma memorização do treino, mas o OOT ainda sustenta o uso",
    "queda alta: sinal de overfitting, o desempenho no treino não se repete no tempo",
  ][faixaQueda(m).i]!;
  return `O AUC cai de ${num(m.metricas.treino.auc, 3)} no treino para ${num(m.metricas.oot.auc, 3)} no OOT — ${veredito}.`;
}

/** OOS vs OOT: separa "o futuro é difícil" de "o modelo é instável". */
export function estabilidadeOosOot(m: Modelo): string {
  const oos = m.metricas.oos.auc;
  const oot = m.metricas.oot.auc;
  const entre = Math.abs(oos - oot);
  const ateOot = Math.abs(m.metricas.treino.auc - oot);
  const cabeca = `A diferença entre OOS (${num(oos, 3)}) e OOT (${num(oot, 3)}) é de ${pp(entre, 1)}`;
  return entre < ateOot
    ? `${cabeca}, bem menor que os ${pp(ateOot, 1)} entre treino e OOT — a perda vem da dificuldade natural de prever o futuro, não de instabilidade do modelo.`
    : `${cabeca}, maior que os ${pp(ateOot, 1)} entre treino e OOT — o modelo oscila entre períodos, e isso pede investigação antes de subir.`;
}

/**
 * As dez faixas agrupadas na régua operacional da fila: quentes (8–10), mornas
 * (5–7) e frias (1–4). É o recorte que a página "Como ler o score" usa para dizer
 * o que fazer com cada lead. `de`/`ate` aqui são posições internas (1 = mais
 * quente), convertidas para o número exibido só no retorno — a ordem interna de
 * `f` é sempre quente→frio, independente do rótulo.
 */
export function grupos(m: Modelo) {
  const f = m.faixas_score;
  const totalConv = f.reduce((s, x) => s + x.conversoes, 0);
  const bloco = (de: number, ate: number, acao: string) => {
    const linhas = f.slice(de - 1, ate);
    const volume = linhas.reduce((s, x) => s + x.volume, 0);
    const conversoes = linhas.reduce((s, x) => s + x.conversoes, 0);
    return { de: faixaExibida(ate), ate: faixaExibida(de), acao, volume, taxa: conversoes / volume, pctVendas: conversoes / totalConv };
  };
  return [
    bloco(1, 3, "Contato humano no mesmo dia. É onde o vendedor rende mais."),
    bloco(4, 6, "Contato humano em prioridade normal, depois que a fila quente esvaziar."),
    bloco(7, 10, "Automação: e-mail, WhatsApp e nutrição. O custo de ligar dificilmente se paga aqui."),
  ];
}

/** Quantas vezes a faixa mais quente converte mais que a mais fria. */
export function liftFaixas(m: Modelo): string {
  const f = m.faixas_score;
  const q = f[0]!;
  const fr = f[f.length - 1]!;
  return `A faixa mais quente converte ${p1(q.taxa_conversao)} contra ${p1(fr.taxa_conversao)} da mais fria — ${num(lift(f), 1)}× mais.`;
}

/** Concentração da importância: quantas variáveis explicam a maior parte do modelo. */
export function concentracao(m: Modelo, alvo = 0.7): string {
  const i = m.importancia_features.findIndex((r) => r.importance_acumulada >= alvo);
  const n = i + 1;
  const acum = m.importancia_features[i]!.importance_acumulada;
  const top = m.importancia_features[0]!;
  return `${n === 1 ? "Uma única variável responde" : `As ${n} variáveis mais importantes respondem`} por ${p1(acum, 0)} do modelo, e ${rotulo(top.feature).toLowerCase()} sozinha vale ${p1(top.importance_relativa, 0)}. As outras ${m.importancia_features.length - n} completam o restante.`;
}

/** Leitura de um bloco de drill-down: o que empurra pra cima e o que derruba. */
export function drill(dd: Modelo["drilldown"][number]): string {
  const v = dd.top_valores;
  const alto = v[0]!;
  const negativos = v.filter((r) => r.contribuicao_media < 0);
  const base = `Em ${rotulo(dd.feature).toLowerCase()}, ${alto.valor} é o valor que mais empurra a conversão para cima (${num(alto.contribuicao_media, 3)} sobre ${num(alto.volume)} leads).`;
  if (negativos.length === 0) return `${base} Nenhum dos ${v.length} valores listados derruba a probabilidade.`;
  const pior = negativos[negativos.length - 1]!;
  return `${base} No outro extremo, ${pior.valor} derruba (${num(pior.contribuicao_media, 3)} sobre ${num(pior.volume)}) — ${negativos.length} de ${v.length} valores contribuem negativamente.`;
}

/** Marcador que o notebook grava quando o nível 2 do recorte vem nulo. */
const SEM_CADASTRO = "(sem cadastro)";

/** Última parte do rótulo do drill-down: "Whatsapp › 0" tem a sujeira no fim. */
const folha = (valor: string) => valor.split("›").pop()!.trim();

/**
 * Valor de categoria que é lixo de cadastro (código cru, vazio, ausência marcada).
 * Olha só a folha do rótulo: desde que o drill-down passou a concatenar origem e
 * nível 2, o lixo mora depois do "›" e um teste no rótulo inteiro não pegaria nada.
 */
export function valorSuspeito(dd: Modelo["drilldown"][number]): string | null {
  const suspeitos = dd.top_valores.filter((x) => {
    const f = folha(x.valor);
    return f === "" || f === SEM_CADASTRO || /^\d+$/.test(f);
  });
  if (suspeitos.length === 0) return null;
  // o mais forte, nao o primeiro da lista: ordenada por contribuicao, o `.find()`
  // devolvia o buraco de cadastro mais inofensivo e o achado saia sem forca.
  const r = suspeitos.slice().sort((a, b) => Math.abs(b.contribuicao_media) - Math.abs(a.contribuicao_media))[0]!;
  const f = folha(r.valor);
  const diagnostico = f === "" || f === SEM_CADASTRO ? "sem nenhum cadastro de segundo nível" : `com o código cru "${f}" no lugar do nome do canal`;
  const cabeca = `${rotulo(dd.feature)} traz "${r.valor}": ${num(r.volume)} leads ${diagnostico}, com contribuição ${num(r.contribuicao_media, 3)}.`;
  const resto =
    suspeitos.length > 1
      ? ` E não está sozinho — ${suspeitos.length} dos ${dd.top_valores.length} valores listados são buraco de cadastro, somando ${num(suspeitos.reduce((s, x) => s + x.volume, 0))} leads.`
      : "";
  return `${cabeca}${resto} Não é canal, é ausência de cadastro entrando no modelo como se fosse origem legítima — vale isolar esses leads antes do próximo retreino.`;
}

/** Tamanho e perfil do subconjunto do experimento de mídia. */
export function subconjunto(d: Pick<Dados, "base" | "campanha">): string {
  const s = d.campanha.subconjunto;
  const geral = d.base.dados.taxa_conversao_geral;
  const dir = s.taxa_conversao < geral ? "abaixo" : "acima";
  return `O experimento roda em ${num(s.n_linhas)} leads — ${p1(s.pct_da_base_limpa)} da base limpa, só os que têm atribuição de campanha. A conversão nesse recorte é ${p1(s.taxa_conversao)}, ${dir} dos ${p1(geral)} da base completa, então nem as métricas nem as faixas devem ser lidas contra as do modelo principal.`;
}

/** Veredito A vs B — mesma régua do notebook 04 (variação de Recall@30% no OOT). */
export function vereditoCampanha(d: { a: Modelo; b: Modelo }): string {
  const a = d.a.metricas.oot.recall_30;
  const b = d.b.metricas.oot.recall_30;
  const dif = b - a;
  const cabeca = `Recall@30% no OOT: ${p1(a)} no modelo A contra ${p1(b)} no B (${dif >= 0 ? "+" : "−"}${pp(dif)}).`;
  if (dif > 0.02) return `${cabeca} As colunas de campanha ajudam de forma relevante — vale incorporá-las ao modelo de produção.`;
  if (dif > 0) return `${cabeca} As colunas de campanha ajudam levemente; o ganho existe mas é menor que 2 p.p.`;
  if (dif === 0) return `${cabeca} As colunas de campanha não mudaram o resultado.`;
  return `${cabeca} As colunas de campanha pioraram o resultado — não vale incorporá-las como estão.`;
}

/** Peso que as 5 colunas de mídia ganharam dentro do modelo B. */
export function pesoCampanha(d: { b: Modelo }, cols: string[]): string {
  const linhas = d.b.importancia_features.filter((r) => cols.includes(r.feature));
  const soma = linhas.reduce((s, r) => s + r.importance_relativa, 0);
  const top = linhas.slice().sort((x, y) => y.importance_relativa - x.importance_relativa)[0];
  if (!top) return `Nenhuma das ${cols.length} colunas de campanha teve ganho positivo no modelo B.`;
  return `Juntas, as ${linhas.length} colunas de campanha somam ${p1(soma)} do ganho do modelo B, e ${rotulo(top.feature).toLowerCase()} é a mais forte delas (${p1(top.importance_relativa)}).`;
}

/** Ações do plano final, ordenadas pelo que os dados sustentam. */
export function acoes(d: Dados) {
  const captura = capturaEm(d.base.faixas_score, TAXA_ATENDIMENTO);
  const difCampanha = d.b.metricas.oot.recall_30 - d.a.metricas.oot.recall_30;
  const f = d.base.faixas_score;
  const lista = [
    {
      titulo: "Priorizar a fila de atendimento pelas faixas de score",
      // o ganho no ponto de operação real decide a prioridade — não um alvo externo
      prioridade: captura - TAXA_ATENDIMENTO > 0.15 ? ("alta" as const) : ("média" as const),
      texto: `Ordenar a fila pelo score leva os mesmos ${p1(TAXA_ATENDIMENTO, 0)} de leads atendidos hoje a cobrir ${p1(captura)} das vendas, contra os ${p1(TAXA_ATENDIMENTO, 0)} de uma fila por ordem de chegada. O ganho é imediato e não depende de dado novo nem de aumentar a equipe.`,
    },
    {
      titulo: difCampanha > 0 ? "Incorporar as colunas de campanha ao modelo de produção" : "Não incorporar as colunas de campanha",
      prioridade: difCampanha > 0.02 ? ("alta" as const) : ("média" as const),
      texto:
        difCampanha > 0
          ? `O experimento mostra ${pp(difCampanha)} de Recall@30%. Antes de subir, retreinar com tuning na base inteira — o experimento rodou em ${p1(d.campanha.subconjunto.pct_da_base_limpa)} dela e sem otimização de hiperparâmetros.`
          : `O experimento não mostrou ganho (${pp(difCampanha)}). Manter o modelo atual e revisitar quando a cobertura de atribuição de mídia crescer.`,
    },
    {
      titulo: "Ampliar a cobertura de atribuição de mídia",
      prioridade: "média" as const,
      texto: `Hoje só ${p1(d.campanha.subconjunto.pct_da_base_limpa)} dos leads têm campanha atribuída. Enquanto for assim, o modelo com mídia não pode virar o modelo de produção — ele só sabe pontuar essa fatia.`,
    },
    {
      titulo: "Retroalimentar as plataformas de mídia com os sinais de quente e frio",
      prioridade: "alta" as const,
      texto: `Exportar as duas pontas do score como audiência: as faixas 8 a 10 viram semente de lookalike, as faixas 1 a 3 viram exclusão. O sinal já existe e não custa dado novo — a faixa mais quente converte ${p1(f[0]!.taxa_conversao)} contra ${p1(f[f.length - 1]!.taxa_conversao)} da mais fria, ${num(lift(f), 1)}× mais. Em vez de só ordenar quem já chegou, a mídia passa a trazer leads mais parecidos com quem compra.`,
    },
    {
      titulo: "Monitorar drift e reprocessar o score",
      prioridade: "alta" as const,
      texto: `A variável mais importante do modelo é ${rotulo(d.base.importancia_features[0]!.feature).toLowerCase()}, que muda mês a mês. O score precisa ser recalculado na mesma cadência e o AUC no tempo acompanhado contra o ${num(d.base.metricas.oot.auc, 3)} do OOT.`,
    },
  ];
  return lista.filter((a): a is typeof a & { texto: string } => a.texto !== null);
}

/**
 * Quanto das vendas o modelo captura em cada corte de contato. Inclui o corte real
 * de atendimento (45%), que não é decil e por isso sai interpolado.
 */
export function cortes(m: Modelo) {
  return [0.1, 0.3, TAXA_ATENDIMENTO, 0.6].map((pctBase) => ({ pctBase, pctConv: capturaEm(m.faixas_score, pctBase) }));
}
