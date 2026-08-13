/**
 * Texto que muda de sentido conforme os dados — nunca hardcoded (ver
 * clients/vw/CLAUDE.md, "Texto vs. dados").
 */
import type { Dados, Modelo } from "./queries";
import { ganho, lift, META_RECALL } from "./queries";
import { num, pct } from "../../core/report";
import { rotulo } from "./report";

const p1 = (v: number, d = 1) => pct(v * 100, d);
const pp = (v: number, d = 1) => num(Math.abs(v) * 100, d) + " p.p.";

/** Manchete da capa: curta o bastante para caber em três linhas de h1. */
export function manchete(d: Pick<Dados, "base">): string {
  const r = d.base.metricas.oot.recall_30;
  return `${p1(r)} das vendas estão nos 30% de leads mais quentes.`;
}

/** A mesma ideia da manchete, desdobrada — usada no corpo, não no título. */
export function resumo(d: Pick<Dados, "base">): string {
  const r = d.base.metricas.oot.recall_30;
  return `Contactando apenas os 30% de leads com maior score, o time alcança ${p1(r)} de todas as vendas — ${num(r / 0.3, 1)}× o resultado de uma discagem sem critério.`;
}

/** Veredito sobre a meta contratada (Recall@30% ≥ 60% no OOT). */
export function vereditoMeta(d: Pick<Dados, "base">): string {
  const r = d.base.metricas.oot.recall_30;
  const gap = META_RECALL - r;
  if (gap <= 0) return `Meta atingida: ${p1(r)} contra os ${p1(META_RECALL, 0)} contratados.`;
  if (gap <= 0.01)
    return `Meta praticamente atingida: ${p1(r)} contra os ${p1(META_RECALL, 0)} contratados — ${pp(gap)} de diferença, dentro da variação esperada de um recorte de dois meses.`;
  return `Meta não atingida: ${p1(r)} contra os ${p1(META_RECALL, 0)} contratados, ${pp(gap)} abaixo.`;
}

/** Quanto o modelo perde do treino para o teste no tempo — leitura de overfitting. */
export function estabilidade(m: Modelo): string {
  const q = m.metricas.treino.auc - m.metricas.oot.auc;
  const veredito =
    q <= 0.06
      ? "queda pequena: o modelo generalizou, não decorou o treino"
      : q <= 0.12
        ? "queda moderada: há alguma memorização do treino, mas o OOT ainda sustenta o uso"
        : "queda alta: sinal de overfitting, o desempenho no treino não se repete no tempo";
  return `O AUC cai de ${num(m.metricas.treino.auc, 3)} no treino para ${num(m.metricas.oot.auc, 3)} no OOT — ${veredito}.`;
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
  const base = `Em ${rotulo(dd.feature).toLowerCase()}, ${alto.valor} é o valor que mais empurra a conversão para cima (${num(alto.contribuicao_media, 3)}).`;
  if (negativos.length === 0) return `${base} Nenhum dos ${v.length} valores listados derruba a probabilidade.`;
  const pior = negativos[negativos.length - 1]!;
  return `${base} No outro extremo, ${pior.valor} derruba (${num(pior.contribuicao_media, 3)}) — ${negativos.length} de ${v.length} valores contribuem negativamente.`;
}

/** Cadastro de produto: quantos valores do top são variação do mesmo termo. */
export function cadastroRepetido(dd: Modelo["drilldown"][number]): string {
  const chave = (s: string) => s.split(/[\s\-]+/)[0]!.toLowerCase().replace(/[^a-z0-9]/g, "");
  // guarda a grafia original da primeira ocorrência — "taos" no texto ficava feio
  const cont = new Map<string, { n: number; termo: string }>();
  for (const r of dd.top_valores) {
    const k = chave(r.valor);
    const at = cont.get(k) ?? { n: 0, termo: r.valor.split(/[\s\-]+/)[0]! };
    cont.set(k, { n: at.n + 1, termo: at.termo });
  }
  const { n, termo } = [...cont.values()].sort((a, b) => b.n - a.n)[0]!;
  if (n < 2) return `Os ${dd.top_valores.length} valores listados são distintos entre si — o cadastro de ${dd.coluna_detalhe} está consistente neste recorte.`;
  return `${n} dos ${dd.top_valores.length} valores são variações de "${termo}": o campo ${dd.coluna_detalhe} é texto livre e a mesma família aparece escrita de várias formas. Limpar esse cadastro concentraria o sinal hoje diluído.`;
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
  const r = d.base.metricas.oot.recall_30;
  const difCampanha = d.b.metricas.oot.recall_30 - d.a.metricas.oot.recall_30;
  const fam = d.base.drilldown.find((x) => x.feature === "FamilyProduct");
  const lista = [
    {
      titulo: "Priorizar a discagem pelas faixas de score",
      prioridade: r >= META_RECALL - 0.01 ? ("alta" as const) : ("média" as const),
      texto: `Ordenar a fila do time de vendas pelo score coloca ${p1(r)} das vendas nos primeiros 30% de contatos. O ganho é imediato e não depende de dado novo.`,
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
      titulo: "Padronizar o cadastro de produto",
      prioridade: "média" as const,
      texto: fam ? cadastroRepetido(fam) : "Sem drill-down de produto neste recorte.",
    },
    {
      titulo: "Monitorar drift e reprocessar o score",
      prioridade: "alta" as const,
      texto: `A variável mais importante do modelo é ${rotulo(d.base.importancia_features[0]!.feature).toLowerCase()}, que muda mês a mês. O score precisa ser recalculado na mesma cadência e o AUC no tempo acompanhado contra o ${num(d.base.metricas.oot.auc, 3)} do OOT.`,
    },
  ];
  return lista;
}

/** Quanto das vendas o modelo captura em cada corte de contato — usado na p.2. */
export function cortes(m: Modelo) {
  const g = ganho(m.faixas_score);
  return [1, 2, 3, 5].map((i) => ({ pctBase: g[i]!.pctBase, pctConv: g[i]!.pctConv }));
}
