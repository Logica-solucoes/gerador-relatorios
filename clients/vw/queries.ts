// Cliente sem banco: os dados vêm dos JSONs exportados pelos notebooks de
// modelagem (ver clients/vw/CLAUDE.md). `_intake/` é gitignored — o build quebra
// sem ele, e é isso mesmo: gerar um relatório com dado ausente seria pior.

type Metricas = { auc: number; ks: number; recall_30: number };
type Faixa = { faixa: number; volume: number; pct_base: number; conversoes: number; taxa_conversao: number };
type Importancia = { feature: string; importance_relativa: number; importance_acumulada: number };
type Drilldown = {
  feature: string;
  coluna_detalhe: string;
  /** Volume mínimo para um valor entrar no ranking (0,1% do treino, notebook 03). */
  piso_volume: number;
  top_valores: { valor: string; contribuicao_media: number; volume: number }[];
};

/** O bloco de output que os dois modelos compartilham — é o que se repete no relatório. */
export type Modelo = {
  metricas: { treino: Metricas; oos: Metricas; oot: Metricas };
  faixas_score: Faixa[];
  importancia_features: Importancia[];
  drilldown: Drilldown[];
};

type ModeloBase = Modelo & {
  gerado_em: string;
  dados: {
    arquivo_origem: string;
    periodo: { inicio: string; fim: string };
    n_linhas: number;
    n_colunas: number;
    taxa_conversao_geral: number;
  };
};

type ModeloCampanha = {
  gerado_em: string;
  aviso: string;
  subconjunto: { n_linhas: number; pct_da_base_limpa: number; taxa_conversao: number };
  modelos: (Modelo & { nome: string })[];
};

/** Meta contratada do projeto (ver metodologia-modelo.md, "Métricas de qualidade"). */
export const META_RECALL = 0.6;

/**
 * Colunas da base limpa, agrupadas como no dicionário de dados. Literal e não
 * parse do markdown: são 25 linhas estáveis, não vale um parser de tabela.
 */
export const COLUNAS = [
  { grupo: "Identificação", nota: "Só rastreabilidade — fora do modelo.", itens: ["ID principal"] },
  {
    grupo: "Brutas",
    nota: "Vieram da exportação do CRM: quem recebeu o lead, por onde ele entrou e qual veículo interessa.",
    itens: ["DN", "DN grupo", "DN - Nome Fantasia", "Sub Origem", "Sub Origem Nível 2", "FamilyProduct", "Versão", "Código do Modelo", "ID da Oferta", "Descrição do Veículo", "Regional"],
  },
  { grupo: "Datas", nota: "Definem o split temporal e alimentam as variáveis de janela. Não entram como variável.", itens: ["DATA_LEAD", "DATA_VENDA", "HORA_LEAD"] },
  {
    grupo: "Engineered",
    nota: "Criadas no processamento, sempre olhando só para trás — histórico do cliente, desempenho recente da concessionária, período do dia e comportamento do lead.",
    itens: ["QTD_LEADS_CLIENTE", "TX_CONV_DN_30D", "FLAG_MADRG", "FLAG_MANHA", "FLAG_TARDE", "FLAG_NOITE", "FLAG_BEST_DRIVE", "FLAG_FORA_HORARIO", "FLAG_TROCA"],
  },
  { grupo: "Target", nota: "O que o modelo aprende a prever: 1 se o lead virou venda identificada.", itens: ["TARGET_CONVERSAO"] },
] as const;

/**
 * Curva de ganho acumulado a partir das faixas de score (faixa 1 = 10% mais
 * quentes). Ponto (0,0) incluso para a curva sair da origem junto com a
 * diagonal do aleatório.
 */
export function ganho(faixas: Faixa[]) {
  const total = faixas.reduce((s, f) => s + f.conversoes, 0);
  let base = 0;
  let conv = 0;
  return [{ pctBase: 0, pctConv: 0 }].concat(
    faixas.map((f) => {
      base += f.pct_base;
      conv += f.conversoes;
      return { pctBase: base, pctConv: conv / total };
    }),
  );
}

/** Quantas vezes a faixa mais quente converte mais que a mais fria. */
export function lift(faixas: Faixa[]) {
  return faixas[0]!.taxa_conversao / faixas[faixas.length - 1]!.taxa_conversao;
}

/** Sem banco — ver NOVO_CLIENTE.md, "Insumos". core/build.ts trata o null. */
export async function conectar() {
  return null;
}

export async function carregar(_pool: unknown) {
  const ler = <T>(f: string) => Bun.file(`${import.meta.dir}/_intake/${f}`).json() as Promise<T>;
  const [base, campanha] = await Promise.all([ler<ModeloBase>("modelo_base.json"), ler<ModeloCampanha>("modelo_campanha.json")]);

  const [a, b] = campanha.modelos;
  if (!a || !b) throw new Error("modelo_campanha.json precisa dos dois modelos (A e B)");

  return { base, campanha, a, b, colunas: COLUNAS };
}

export type Dados = Awaited<ReturnType<typeof carregar>>;
