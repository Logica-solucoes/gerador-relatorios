import sql from "mssql";

// ── Regras de negócio herdadas de VwApiAuditoria/db.py ──────────────────────
// Se alguma delas mudar lá, muda aqui junto — o relatório e o dashboard não
// podem divergir num número que o time vai comparar lado a lado.

/** Início fixo pedido pelo negócio. O fim é sempre ontem (o dia vivo nunca entra). */
export const JANELA_INICIO = "2026-06-01";

/** Leads mais novos que isso ainda não tiveram tempo de ser contatados/auditados,
 *  então ficam fora dos cards de volume/conversão. É a diferença entre "leads
 *  criados" e "base disponível para auditoria" — as duas aparecem no relatório. */
export const DIAS_LAG = 15;

/** Ticket médio: premissa fixa do dashboard, não um valor medido. */
export const TICKET_MEDIO = 130_000;

/**
 * Curva de decis do modelo de Lead Scoring (`clients/vw/_intake/modelo_base.json`,
 * copiado — não recalculado). Esta auditoria não tem score nenhum; o que ela mede
 * é a taxa de contato real (`kpis.txContato`), e o que o modelo empresta é a
 * *forma* da curva de conversão por decil — o quanto o topo do score converte
 * mais que o fundo. Se o export do modelo mudar, recopie o arquivo.
 */
type FaixaScore = { faixa: number; volume: number; pct_base: number; conversoes: number; taxa_conversao: number };
type ModeloScore = { faixas_score: FaixaScore[] };

/**
 * Curva de ganho acumulado a partir das faixas do modelo (mesma lógica de
 * `clients/vw/queries.ts:ganho`, copiada e não reimportada — os dois clientes
 * não compartilham módulo). Ponto (0,0) incluso para a curva sair da origem.
 */
function ganho(faixas: FaixaScore[]) {
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

/** Quanto das vendas se captura contactando `pct` da fila, ordenada por score.
 *  Decis não cobrem todo corte — interpola entre os dois pontos vizinhos. */
export function capturaEm(faixas: FaixaScore[], pct: number) {
  const g = ganho(faixas);
  const i = g.findIndex((p) => p.pctBase >= pct);
  if (i <= 0) return g[i === 0 ? 0 : g.length - 1]!.pctConv;
  const a = g[i - 1]!;
  const b = g[i]!;
  return a.pctConv + ((pct - a.pctBase) / (b.pctBase - a.pctBase)) * (b.pctConv - a.pctConv);
}

/** Piso de amostra para qualquer recorte virar linha de tabela ou barra de gráfico.
 *  Sem ele, concessionária com 2 respostas aparece com 100% de taxa de contato e
 *  encabeça o ranking — o relatório inteiro existe para ensinar a não cair nisso. */
export const PISO_AMOSTRA = 10;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const diasAtras = (n: number) => iso(new Date(Date.now() - n * 864e5));

export const FIM = diasAtras(1);
export const FIM_DISPONIVEL = diasAtras(DIAS_LAG);

/** Mesma expressão de venda da vw_volks_leads_auditados, aplicada em vw_volks_leads
 *  (que inclui os leads ainda não auditados — a view de auditados é INNER JOIN). */
const VENDA = "CASE WHEN venda_identificada = 1 THEN 1 WHEN dt_fatura IS NOT NULL THEN 1 ELSE 0 END";

/** Sem default: conectar no banco errado em silêncio é pior que falhar na hora. */
function req(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não definida. Configure o .env (veja .env.example).`);
  return v;
}

export async function conectar() {
  return sql.connect({
    server: req("DB_HOST"),
    port: Number(process.env.DB_PORT || 1433),
    user: req("DB_USER"),
    password: req("DB_PASS"),
    database: req("DB_NAME"),
    // max: 1 não é ajuste de performance — é o que garante que as #temp
    // criadas em `materializar` ainda existam nas queries seguintes. Com pool
    // maior cada request pode cair noutra sessão e a #aud "some".
    pool: { max: 1, min: 1, idleTimeoutMillis: 300_000 },
    options: {
      encrypt: true,
      trustServerCertificate: process.env.DB_TRUST_CERT === "true",
    },
    connectionTimeout: 30_000,
    requestTimeout: 180_000,
  });
}

const q = (pool: sql.ConnectionPool) => async <T>(text: string): Promise<T[]> =>
  (await pool.request().query(text)).recordset as T[];

/** vw_volks_auditoria é uma view de 10 CTEs. O otimizador a re-expande em cada
 *  query e escolhe nested loop, reavaliando-a por lead — 56s no total. Materializar
 *  uma vez derruba pra menos de 1s. Mesma tática do db.py da API.
 *
 *  `.batch()` e não `.query()`: o `query()` do mssql executa via `sp_executesql`,
 *  e #temp criada dentro de sproc morre junto com ela — a query seguinte só vê
 *  "Invalid object name '#aud'". `batch()` manda um lote de verdade, no escopo da
 *  sessão. Ler pode ser com `query()` normal (sproc enxerga #temp da sessão). */
async function materializar(pool: sql.ConnectionPool) {
  await pool.request().batch(`
    IF OBJECT_ID('tempdb..#aud') IS NOT NULL DROP TABLE #aud;
    SELECT * INTO #aud FROM vw_volks_leads_auditados
    WHERE dt_criacao BETWEEN '${JANELA_INICIO}' AND '${FIM}'
    OPTION (HASH JOIN);
  `);
  await pool.request().batch(`
    IF OBJECT_ID('tempdb..#aud_raw') IS NOT NULL DROP TABLE #aud_raw;
    SELECT id_externo, marca_ia, modelo_ia INTO #aud_raw FROM vw_volks_auditoria;
  `);
}

const nps = (p: number, d: number, t: number) => (t ? Math.round(((p - d) / t) * 1000) / 10 : 0);
const taxa = (sim: number, nao: number) => (sim + nao ? Math.round((sim / (sim + nao)) * 1000) / 10 : 0);

const MES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ── Nuvem de palavras ──────────────────────────────────────────────────────
// A API faz isso em Python; aqui é a mesma regra (4+ letras, sem acento, sem
// stopword) porque o relatório precisa bater com o dashboard palavra a palavra.
const STOPWORDS = new Set(`nenhum nenhuma nada tudo todo toda todos todas outro outra outros outras
mesmo mesma mesmos mesmas esse essa esses essas este esta estes estas isso aquilo aquele aquela
aqueles aquelas para pela pelo pelas pelos como quando onde porque pois entao ainda apenas tambem
depois antes sobre entre desde cada qualquer quais qual quem meu minha meus minhas seu sua seus
suas nosso nossa nossos nossas dele dela deles delas voce voces tenho tens temos tinha tinham
tenha tenham fazer faco fez feito fazendo estou esta estao estava estavam estar sendo sido seja
sejam sera serao foram fomos somos eram ficou ficar fica muito muita muitos muitas pouco pouca
poucos poucas mais menos bem sem com sim nao entretanto porem contudo talvez assim agora hoje
ontem amanha aqui ali gente coisa coisas vezes sempre nunca jamais logo dizer disse falou falar
quer quero queria`.split(/\s+/));

const SENTIMENTO = { positiva: "positivo", neutra: "neutro", negativa: "negativo" } as const;
export const ORDEM_SENTIMENTO = ["positivo", "neutro", "negativo"] as const;
export type Sentimento = (typeof ORDEM_SENTIMENTO)[number];

const limpa = (bruta: string) =>
  bruta
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]/g, "");

function agregaSentimento(rows: { analise: string | null; palavras: string | null }[]) {
  const volume: Record<Sentimento, number> = { positivo: 0, neutro: 0, negativo: 0 };
  const contagem = new Map<string, Record<Sentimento, number>>();

  for (const { analise, palavras } of rows) {
    const s = SENTIMENTO[(analise ?? "").trim().toLowerCase() as keyof typeof SENTIMENTO];
    if (!s) continue;
    volume[s]++;
    for (const bruta of (palavras ?? "").split(/\s+/)) {
      const p = limpa(bruta);
      if (p.length < 4 || STOPWORDS.has(p)) continue;
      const e = contagem.get(p) ?? { positivo: 0, neutro: 0, negativo: 0 };
      e[s]++;
      contagem.set(p, e);
    }
  }

  const palavras = [...contagem]
    .map(([palavra, e]) => ({
      palavra,
      n: e.positivo + e.neutro + e.negativo,
      // sentimento dominante dá a cor da palavra; empate cai no primeiro da ordem
      sentimento: ORDEM_SENTIMENTO.reduce((a, b) => (e[b] > e[a] ? b : a)) as Sentimento,
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 20);

  return { volume, palavras };
}

// ── Carga ──────────────────────────────────────────────────────────────────

type Contagem = { rotulo: string; n: number };
type NpsRow = { rotulo: string; promotores: number; detratores: number; total: number };
type ContatoRow = { rotulo: string; sim: number; nao: number };

export async function carregar(pool: sql.ConnectionPool) {
  await materializar(pool);
  const run = q(pool);
  const modelo = await Bun.file(`${import.meta.dir}/_intake/modelo_base.json`).json() as ModeloScore;

  const JANELA = `dt_criacao BETWEEN '${JANELA_INICIO}' AND '${FIM}'`;
  const JANELA_DISP = `dt_criacao BETWEEN '${JANELA_INICIO}' AND '${FIM_DISPONIVEL}'`;

  const [
    volumeTotal,
    volumeDisp,
    funilBruto,
    resultado,
    contatoDia,
    npsNotas,
    tempoDist,
    npsTempoBruto,
    statusTempoBruto,
    statusGeral,
    statusNaoPreencheu,
    canalUso,
    npsCanalBruto,
    canalPreferencia,
    npsRegionalBruto,
    npsModeloBruto,
    contatoRegionalBruto,
    contatoModeloBruto,
    leadsRegional,
    audRegional,
    leadsDn,
    audDn,
    comentariosBrutos,
    concorrencia,
    subOrigem,
    contatoOrigemBruto,
  ] = await Promise.all([
    run<{ leads: number; vendas: number }>(`
      SELECT COUNT(*) AS leads, SUM(${VENDA}) AS vendas FROM vw_volks_leads WHERE ${JANELA}`),

    run<{ leads: number; vendas: number }>(`
      SELECT COUNT(*) AS leads, SUM(${VENDA}) AS vendas FROM vw_volks_leads WHERE ${JANELA_DISP}`),

    run<{ abordados: number; telValido: number; responderam: number; respContato: number; contatoSim: number }>(`
      SELECT COUNT(*) AS abordados,
        SUM(CASE WHEN telvalido = 'Sim' THEN 1 ELSE 0 END) AS telValido,
        SUM(CASE WHEN auditado = 'Sim' THEN 1 ELSE 0 END) AS responderam,
        SUM(CASE WHEN contato IS NOT NULL THEN 1 ELSE 0 END) AS respContato,
        SUM(CASE WHEN contato = 'Sim' THEN 1 ELSE 0 END) AS contatoSim
      FROM #aud`),

    run<{
      telSim: number; telNao: number; contatoSim: number; contatoNao: number;
      preencheuSim: number; preencheuNao: number; concorrencia: number;
      recuperar: number; vendasRecuperadas: number;
      promotores: number; detratores: number; totalNps: number;
      contatoWpp: number; contatoComCanal: number;
    }>(`
      SELECT
        SUM(CASE WHEN telvalido = 'Sim' THEN 1 ELSE 0 END) AS telSim,
        SUM(CASE WHEN telvalido = 'Não' THEN 1 ELSE 0 END) AS telNao,
        SUM(CASE WHEN auditado = 'Sim' AND contato = 'Sim' THEN 1 ELSE 0 END) AS contatoSim,
        SUM(CASE WHEN auditado = 'Sim' AND contato = 'Não' THEN 1 ELSE 0 END) AS contatoNao,
        SUM(CASE WHEN auditado = 'Sim' AND preencheu = 'Sim' THEN 1 ELSE 0 END) AS preencheuSim,
        SUM(CASE WHEN auditado = 'Sim' AND preencheu = 'Não' THEN 1 ELSE 0 END) AS preencheuNao,
        SUM(CASE WHEN status LIKE '%outra marca%' THEN 1 ELSE 0 END) AS concorrencia,
        SUM(CASE WHEN recuperar = 'Sim' THEN 1 ELSE 0 END) AS recuperar,
        SUM(CASE WHEN venda = 1 AND recuperar = 'Sim' THEN 1 ELSE 0 END) AS vendasRecuperadas,
        SUM(CASE WHEN nps >= 9 AND canal IS NOT NULL THEN 1 ELSE 0 END) AS promotores,
        SUM(CASE WHEN nps <= 6 AND canal IS NOT NULL THEN 1 ELSE 0 END) AS detratores,
        SUM(CASE WHEN nps IS NOT NULL AND canal IS NOT NULL THEN 1 ELSE 0 END) AS totalNps,
        SUM(CASE WHEN auditado = 'Sim' AND contato = 'Sim' AND canal LIKE '%hats%' THEN 1 ELSE 0 END) AS contatoWpp,
        SUM(CASE WHEN auditado = 'Sim' AND contato = 'Sim' AND canal IS NOT NULL THEN 1 ELSE 0 END) AS contatoComCanal
      FROM #aud`),

    run<{ dia: Date; sim: number; nao: number }>(`
      SELECT CAST(dt_criacao AS DATE) AS dia,
        SUM(CASE WHEN contato = 'Sim' THEN 1 ELSE 0 END) AS sim,
        SUM(CASE WHEN contato = 'Não' THEN 1 ELSE 0 END) AS nao
      FROM #aud GROUP BY CAST(dt_criacao AS DATE) ORDER BY dia`),

    run<{ nota: number; n: number }>(`
      SELECT nps AS nota, COUNT(*) AS n FROM #aud WHERE nps IS NOT NULL GROUP BY nps ORDER BY nps`),

    run<Contagem>(`
      SELECT tempo AS rotulo, COUNT(*) AS n FROM #aud
      WHERE auditado = 'Sim' AND tempo IS NOT NULL GROUP BY tempo`),

    run<NpsRow>(`
      SELECT tempo AS rotulo,
        SUM(CASE WHEN nps >= 9 THEN 1 ELSE 0 END) AS promotores,
        SUM(CASE WHEN nps <= 6 THEN 1 ELSE 0 END) AS detratores,
        SUM(CASE WHEN nps IS NOT NULL THEN 1 ELSE 0 END) AS total
      FROM #aud WHERE auditado = 'Sim' AND tempo IS NOT NULL GROUP BY tempo`),

    run<{ tempo: string; status: string; n: number }>(`
      SELECT tempo, status, COUNT(*) AS n FROM #aud
      WHERE auditado = 'Sim' AND tempo IS NOT NULL AND status IS NOT NULL
      GROUP BY tempo, status`),

    run<Contagem>(`
      SELECT status AS rotulo, COUNT(*) AS n FROM #aud
      WHERE auditado = 'Sim' AND status IS NOT NULL GROUP BY status ORDER BY COUNT(*) DESC`),

    run<Contagem>(`
      SELECT status AS rotulo, COUNT(*) AS n FROM #aud
      WHERE auditado = 'Sim' AND status IS NOT NULL AND preencheu = 'Não'
      GROUP BY status ORDER BY COUNT(*) DESC`),

    run<Contagem>(`
      SELECT canal AS rotulo, COUNT(*) AS n FROM #aud
      WHERE auditado = 'Sim' AND contato = 'Sim' AND canal IS NOT NULL
      GROUP BY canal ORDER BY COUNT(*) DESC`),

    run<NpsRow>(`
      SELECT canal AS rotulo,
        SUM(CASE WHEN nps >= 9 THEN 1 ELSE 0 END) AS promotores,
        SUM(CASE WHEN nps <= 6 THEN 1 ELSE 0 END) AS detratores,
        SUM(CASE WHEN nps IS NOT NULL THEN 1 ELSE 0 END) AS total
      FROM #aud WHERE canal IS NOT NULL GROUP BY canal`),

    run<{ pedido: string; usado: string; n: number }>(`
      SELECT preferencia_contato AS pedido, canal AS usado, COUNT(*) AS n
      FROM #aud WHERE canal IS NOT NULL AND preferencia_contato IS NOT NULL
      GROUP BY preferencia_contato, canal`),

    run<NpsRow>(`
      SELECT CAST(regional AS varchar) AS rotulo,
        SUM(CASE WHEN nps >= 9 THEN 1 ELSE 0 END) AS promotores,
        SUM(CASE WHEN nps <= 6 THEN 1 ELSE 0 END) AS detratores,
        SUM(CASE WHEN nps IS NOT NULL THEN 1 ELSE 0 END) AS total
      FROM #aud WHERE regional IS NOT NULL AND auditado = 'Sim' GROUP BY regional ORDER BY regional`),

    run<NpsRow>(`
      SELECT modelo AS rotulo,
        SUM(CASE WHEN nps >= 9 THEN 1 ELSE 0 END) AS promotores,
        SUM(CASE WHEN nps <= 6 THEN 1 ELSE 0 END) AS detratores,
        SUM(CASE WHEN nps IS NOT NULL THEN 1 ELSE 0 END) AS total
      FROM #aud WHERE modelo IS NOT NULL AND auditado = 'Sim' GROUP BY modelo`),

    run<ContatoRow>(`
      SELECT CAST(regional AS varchar) AS rotulo,
        SUM(CASE WHEN contato = 'Sim' THEN 1 ELSE 0 END) AS sim,
        SUM(CASE WHEN contato = 'Não' THEN 1 ELSE 0 END) AS nao
      FROM #aud WHERE regional IS NOT NULL AND auditado = 'Sim' GROUP BY regional ORDER BY regional`),

    run<ContatoRow>(`
      SELECT modelo AS rotulo,
        SUM(CASE WHEN contato = 'Sim' THEN 1 ELSE 0 END) AS sim,
        SUM(CASE WHEN contato = 'Não' THEN 1 ELSE 0 END) AS nao
      FROM #aud WHERE modelo IS NOT NULL AND auditado = 'Sim' GROUP BY modelo`),

    run<{ regional: number; leads: number; vendas: number }>(`
      SELECT regional, COUNT(*) AS leads, SUM(${VENDA}) AS vendas
      FROM vw_volks_leads WHERE ${JANELA} AND regional IS NOT NULL GROUP BY regional`),

    run<{ regional: number; sim: number; nao: number; concorrencia: number; auditados: number }>(`
      SELECT regional,
        SUM(CASE WHEN contato = 'Sim' THEN 1 ELSE 0 END) AS sim,
        SUM(CASE WHEN contato = 'Não' THEN 1 ELSE 0 END) AS nao,
        SUM(CASE WHEN status LIKE '%outra marca%' THEN 1 ELSE 0 END) AS concorrencia,
        COUNT(*) AS auditados
      FROM #aud WHERE regional IS NOT NULL AND auditado = 'Sim' GROUP BY regional`),

    run<{ dn: string; leads: number; vendas: number }>(`
      SELECT dn, COUNT(*) AS leads, SUM(${VENDA}) AS vendas
      FROM vw_volks_leads WHERE ${JANELA} AND dn IS NOT NULL GROUP BY dn`),

    run<{ dn: string; nome: string; grupo: string; sim: number; nao: number; concorrencia: number; auditados: number }>(`
      SELECT dn, dn_nome_fantasia AS nome, dn_grupo AS grupo,
        SUM(CASE WHEN contato = 'Sim' THEN 1 ELSE 0 END) AS sim,
        SUM(CASE WHEN contato = 'Não' THEN 1 ELSE 0 END) AS nao,
        SUM(CASE WHEN status LIKE '%outra marca%' THEN 1 ELSE 0 END) AS concorrencia,
        COUNT(*) AS auditados
      FROM #aud WHERE dn IS NOT NULL AND auditado = 'Sim'
      GROUP BY dn, dn_nome_fantasia, dn_grupo`),

    // palavras_resposta é o que o dashboard exibe como "comentário": a IA já
    // reduziu a fala do cliente às palavras que carregam sentido. comentario_ia
    // NÃO serve — é um código numérico (0/1/2), não texto.
    run<{ analise: string | null; palavras: string | null; dia: Date }>(`
      SELECT analise_resposta AS analise, palavras_resposta AS palavras, dt_criacao AS dia
      FROM #aud WHERE analise_resposta IS NOT NULL ORDER BY dt_criacao DESC`),

    // Join corrigido em 12/08/2026 no master da API: id_externo é ID Salesforce
    // (varchar), casa com id_principal — não com o id numérico do lead. O COLLATE
    // é obrigatório, as duas colunas vêm de collations diferentes.
    run<{ marca: string; modelo: string | null; n: number }>(`
      SELECT va.marca_ia AS marca, va.modelo_ia AS modelo,
             COUNT(DISTINCT l.id_volks_leads) AS n
      FROM vw_volks_leads l
      INNER JOIN vw_volks_min_leads m ON l.id_volks_leads = m.id_volks_leads
      JOIN #aud_raw va ON va.id_externo COLLATE Latin1_General_CS_AS = m.id_principal
      WHERE l.${JANELA} AND va.marca_ia IS NOT NULL
      GROUP BY va.marca_ia, va.modelo_ia ORDER BY n DESC`),

    run<{ rotulo: string; leads: number; vendas: number }>(`
      SELECT sub_origem AS rotulo, COUNT(*) AS leads, SUM(${VENDA}) AS vendas
      FROM vw_volks_leads WHERE ${JANELA} AND sub_origem IS NOT NULL
      GROUP BY sub_origem ORDER BY COUNT(*) DESC`),

    run<ContatoRow>(`
      SELECT sub_origem AS rotulo,
        SUM(CASE WHEN contato = 'Sim' THEN 1 ELSE 0 END) AS sim,
        SUM(CASE WHEN contato = 'Não' THEN 1 ELSE 0 END) AS nao
      FROM #aud WHERE sub_origem IS NOT NULL AND auditado = 'Sim' GROUP BY sub_origem`),
  ]);

  const r = resultado[0]!;
  const totalGeral = volumeTotal[0]!;
  const disp = volumeDisp[0]!;

  // Vendas perdidas: taxa de conversão global aplicada só sobre quem respondeu
  // "não houve contato". Nunca extrapolada para a base inteira.
  const perdas = (contatoNao: number, leads: number, vendas: number, conc: number) => {
    const atendimento = Math.round(contatoNao * (leads ? vendas / leads : 0));
    return { atendimento, concorrencia: conc, total: atendimento + conc };
  };
  const perdaGeral = perdas(r.contatoNao, totalGeral.leads, totalGeral.vendas, r.concorrencia);

  /**
   * Projeção: e se a fila fosse atendida na ordem do score, na mesma taxa de
   * contato medida hoje? `corte` é a taxa de contato real (`txContato`, medida
   * em `nContato` respostas — sample, não a base inteira). `taxaHoje` é a
   * conversão real da base disponível (não survey, dado de venda de verdade).
   * O modelo só empresta a *forma* da curva (`capturaEm`); o nível vem daqui.
   */
  const corte = taxa(r.contatoSim, r.contatoNao) / 100;
  const captura = capturaEm(modelo.faixas_score, corte);
  const mult = captura / corte;
  const taxaHoje = disp.leads ? disp.vendas / disp.leads : 0;
  const vendasHoje = disp.vendas;
  const projecao = {
    corte,
    nContato: r.contatoSim + r.contatoNao,
    captura,
    mult,
    taxaHoje,
    taxaOrdenada: taxaHoje * mult,
    vendasHoje,
    vendasOrdenada: vendasHoje * mult,
    vendasExtras: vendasHoje * (mult - 1),
  };

  // Mês a mês é rollup do dia a dia — mesmo recorte, só muda o grão.
  const porMes = new Map<string, { sim: number; nao: number; ordem: number }>();
  for (const { dia, sim, nao } of contatoDia) {
    const d = new Date(dia);
    const chave = `${MES_PT[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
    const e = porMes.get(chave) ?? { sim: 0, nao: 0, ordem: d.getUTCFullYear() * 12 + d.getUTCMonth() };
    porMes.set(chave, { sim: e.sim + sim, nao: e.nao + nao, ordem: e.ordem });
  }

  const statusPorTempo = new Map<string, Map<string, number>>();
  for (const { tempo, status, n } of statusTempoBruto) {
    const e = statusPorTempo.get(tempo) ?? new Map();
    e.set(status, (e.get(status) ?? 0) + n);
    statusPorTempo.set(tempo, e);
  }

  return {
    periodo: { inicio: JANELA_INICIO, fim: FIM, fimDisponivel: FIM_DISPONIVEL, diasLag: DIAS_LAG },

    faixasScore: modelo.faixas_score,
    projecao,

    // Cards do dashboard, mesmos nomes de conceito.
    kpis: {
      leadsCriados: totalGeral.leads,
      leadsDisponiveis: disp.leads,
      vendas: disp.vendas,
      txVendas: disp.leads ? Math.round((disp.vendas / disp.leads) * 1000) / 10 : 0,
      abordados: funilBruto[0]!.abordados,
      txAbordados: totalGeral.leads ? Math.round((funilBruto[0]!.abordados / totalGeral.leads) * 1000) / 10 : 0,
      telValidos: r.telSim,
      txTelValidos: taxa(r.telSim, r.telNao),
      txContato: taxa(r.contatoSim, r.contatoNao),
      nContato: r.contatoSim + r.contatoNao,
      txPreencheu: taxa(r.preencheuSim, r.preencheuNao),
      nPreencheu: r.preencheuSim + r.preencheuNao,
      npsGeral: nps(r.promotores, r.detratores, r.totalNps),
      nNps: r.totalNps,
      txWpp: r.contatoComCanal ? Math.round((r.contatoWpp / r.contatoComCanal) * 1000) / 10 : 0,
      nWpp: r.contatoComCanal,
      leadsRecuperar: r.recuperar,
      vendasRecuperadas: r.vendasRecuperadas,
      perdasAtendimento: perdaGeral.atendimento,
      perdasConcorrencia: perdaGeral.concorrencia,
      perdasTotal: perdaGeral.total,
      faturamentoPerdido: perdaGeral.total * TICKET_MEDIO,
    },

    funil: [
      { etapa: "Leads criados no período", n: totalGeral.leads },
      { etapa: "Abordados pela auditoria", n: funilBruto[0]!.abordados },
      { etapa: "Telefone válido", n: funilBruto[0]!.telValido },
      { etapa: "Responderam alguma pergunta", n: funilBruto[0]!.responderam },
      { etapa: "Responderam “houve contato?”", n: funilBruto[0]!.respContato },
      { etapa: "Disseram que houve contato", n: funilBruto[0]!.contatoSim },
    ],

    contatoMes: [...porMes]
      .sort((a, b) => a[1].ordem - b[1].ordem)
      .filter(([, v]) => v.sim + v.nao > 0)
      .map(([mes, v]) => ({ mes, tx: taxa(v.sim, v.nao), n: v.sim + v.nao })),

    contatoDia: contatoDia
      .filter((d) => d.sim + d.nao > 0)
      .map((d) => ({ dia: new Date(d.dia), tx: taxa(d.sim, d.nao), n: d.sim + d.nao })),

    npsNotas: npsNotas.map((r) => ({ nota: r.nota, n: r.n })),

    tempo: tempoDist.map((t) => ({ tempo: t.rotulo, n: t.n })),

    npsTempo: npsTempoBruto
      .filter((t) => t.total > 0)
      .map((t) => ({ tempo: t.rotulo, nps: nps(t.promotores, t.detratores, t.total), n: t.total })),

    statusTempo: [...statusPorTempo].map(([tempo, m]) => ({
      tempo,
      total: [...m.values()].reduce((a, b) => a + b, 0),
      status: [...m].map(([status, n]) => ({ status, n })),
    })),

    status: statusGeral.map((s) => ({ status: s.rotulo, n: s.n })),
    statusNaoPreencheu: statusNaoPreencheu.map((s) => ({ status: s.rotulo, n: s.n })),

    canalUso: canalUso.map((c) => ({ canal: c.rotulo, n: c.n })),
    npsCanal: npsCanalBruto
      .filter((c) => c.total > 0)
      .map((c) => ({ canal: c.rotulo, nps: nps(c.promotores, c.detratores, c.total), n: c.total })),

    canalPreferencia: canalPreferencia.map((c) => ({ pedido: c.pedido, usado: c.usado, n: c.n })),

    npsRegional: npsRegionalBruto
      .filter((x) => x.total > 0)
      .map((x) => ({ regional: x.rotulo, nps: nps(x.promotores, x.detratores, x.total), n: x.total })),

    npsModelo: npsModeloBruto
      .filter((x) => x.total > 0)
      .map((x) => ({ modelo: x.rotulo, nps: nps(x.promotores, x.detratores, x.total), n: x.total }))
      .sort((a, b) => b.nps - a.nps),

    contatoRegional: contatoRegionalBruto.map((x) => ({
      regional: x.rotulo, tx: taxa(x.sim, x.nao), n: x.sim + x.nao,
    })),

    contatoModelo: contatoModeloBruto
      .map((x) => ({ modelo: x.rotulo, tx: taxa(x.sim, x.nao), n: x.sim + x.nao }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.tx - a.tx),

    tabelaRegional: audRegional
      .map((a) => {
        const v = leadsRegional.find((l) => l.regional === a.regional) ?? { leads: 0, vendas: 0 };
        const p = perdas(a.nao, v.leads, v.vendas, a.concorrencia);
        return {
          regional: String(a.regional),
          leads: v.leads,
          vendas: v.vendas,
          txContato: taxa(a.sim, a.nao),
          nContato: a.sim + a.nao,
          txConcorrencia: a.auditados ? Math.round((a.concorrencia / a.auditados) * 1000) / 10 : 0,
          perdas: p.total,
        };
      })
      .sort((a, b) => b.perdas - a.perdas),

    /** Quantas concessionárias existem na base vs. quantas têm amostra para virar
     *  linha de tabela. A diferença é o argumento do piso, e a narrativa cita as duas. */
    dnCobertura: {
      total: audDn.length,
      comAmostra: audDn.filter((a) => a.sim + a.nao >= PISO_AMOSTRA).length,
      piso: PISO_AMOSTRA,
    },

    tabelaDn: audDn
      .filter((a) => a.sim + a.nao >= PISO_AMOSTRA)
      .map((a) => {
        const v = leadsDn.find((l) => l.dn === a.dn) ?? { leads: 0, vendas: 0 };
        const p = perdas(a.nao, v.leads, v.vendas, a.concorrencia);
        return {
          dn: a.dn,
          nome: a.nome ?? a.dn,
          grupo: a.grupo ?? "Sem grupo",
          leads: v.leads,
          txContato: taxa(a.sim, a.nao),
          nContato: a.sim + a.nao,
          concorrencia: a.concorrencia,
          perdas: p.total,
        };
      })
      .sort((a, b) => b.txContato - a.txContato),

    sentimento: {
      ...agregaSentimento(comentariosBrutos),
      comentarios: comentariosBrutos
        .map((c) => ({
          texto: (c.palavras ?? "").trim(),
          sentimento: SENTIMENTO[(c.analise ?? "").trim().toLowerCase() as keyof typeof SENTIMENTO],
        }))
        // fala de uma palavra só não é comentário legível, é ruído de extração
        .filter((c) => c.sentimento && c.texto.split(/\s+/).length >= 4),
    },

    concorrencia: concorrencia.map((c) => ({
      marca: c.marca,
      modelo: c.modelo,
      rotulo: c.modelo ? `${c.marca} ${c.modelo}` : c.marca,
      n: c.n,
    })),

    contatoOrigem: contatoOrigemBruto
      .filter((x) => x.sim + x.nao >= PISO_AMOSTRA)
      .map((x) => ({ origem: x.rotulo, tx: taxa(x.sim, x.nao), n: x.sim + x.nao }))
      .sort((a, b) => b.tx - a.tx),

    subOrigem: subOrigem
      .filter((s) => s.leads >= 100) // origens com dezenas de leads não sustentam taxa
      .map((s) => ({
        origem: s.rotulo,
        leads: s.leads,
        vendas: s.vendas,
        tx: s.leads ? Math.round((s.vendas / s.leads) * 1000) / 10 : 0,
      })),
  };
}

export type Dados = Awaited<ReturnType<typeof carregar>>;
