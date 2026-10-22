import sql from "mssql";

// ── Regras de negócio herdadas de VwApiAuditoria/db.py ──────────────────────
// Mesma fonte da verdade do relatório `vw_auditoria`. Se db.py mudar, os dois
// mudam juntos — o time lê os dois lado a lado com o dashboard.

/** Dia em que a pergunta do questionário de auditoria mudou. Nada antes disso
 *  entra no relatório: as respostas antigas respondiam outra pergunta, e na
 *  série elas apareciam como uma melhora de ~50% para ~75% que não aconteceu. */
export const INICIO_QUESTIONARIO = "2026-08-17";

/** Ticket médio: premissa fixa do dashboard, não um valor medido. */
export const TICKET_MEDIO = 130_000;

/** Piso de amostra para um recorte virar linha de tabela ou barra de gráfico. */
export const PISO_AMOSTRA = 10;

/** Semanas de auditoria que alimentam os cortes finos (motivo, concessionária,
 *  origem, NPS × tempo). Uma semana só não sustenta nenhum deles: na melhor
 *  semana o motivo declarado tem 19 respostas no topo e 1 na cauda. */
export const SEMANAS_JANELA = 8;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * **`data` é a data em que a auditoria foi feita** — e é ela que recorta este
 * relatório inteiro, não `dt_criacao`.
 *
 * O dashboard de auditoria e o `vw_auditoria` recortam por data do lead; aqui é
 * de propósito o contrário. A pergunta deste relatório é operacional ("o que a
 * auditoria apurou na semana passada?"), e a amostra é sorteada: uma rodada de
 * segunda pode ouvir lead do começo e do fim do mês. Agrupar por `dt_criacao`
 * espalhava uma mesma rodada por semanas diferentes.
 *
 * Efeito colateral que resolveu o problema mais sério da versão anterior: como
 * auditoria feita é fato consumado, **não existe maturação a esperar**. A
 * semana fecha no domingo e está completa. Some o `DIAS_LAG` e some a consulta
 * que procurava "a última semana madura".
 */
const DATA = "data";

// Segunda-feira da semana. DATEPART(weekday) muda de valor conforme
// @@DATEFIRST da sessão (US e pt-BR usam defaults diferentes) — uma versão
// anterior compensava isso com "+5) % 7", mas esse ajuste só cancela o
// DATEFIRST=7 (o padrão americano); com DATEFIRST=1 (comum em locale pt-BR)
// ele desloca a semana inteira sem erro visível. Dia 0 do SQL Server
// (1900-01-01) é sempre segunda-feira, e DATEDIFF em dias nunca depende de
// DATEFIRST — por isso o cálculo sai do calendário, não da sessão.
const SEM = `DATEADD(day, -(DATEDIFF(day, 0, ${DATA}) % 7), CAST(${DATA} AS DATE))`;

/** Segunda-feira da semana de `d`, em UTC. */
function segunda(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

const maisSemanas = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n * 7);
  return x;
};

/**
 * Data que o relatório considera "hoje". `HOJE=2026-08-20` reprocessa a semana
 * daquela data — é como se audita uma rodada antiga e como o agendador refaz
 * uma semana que falhou, sem mexer em código.
 */
export function referencia() {
  const v = process.env.HOJE;
  if (!v) return new Date();
  const d = new Date(v.length === 10 ? v + "T12:00:00Z" : v);
  if (isNaN(d.getTime())) throw new Error(`HOJE inválida: "${v}". Use AAAA-MM-DD.`);
  return d;
}

/** As quatro datas da janela, a partir da segunda-feira da semana do comparativo. */
export function janela(atual: Date) {
  return {
    atual,
    anterior: maisSemanas(atual, -1),
    /** Início da janela acumulada dos cortes finos (exclusivo). */
    janelaInicio: maisSemanas(atual, -SEMANAS_JANELA),
    /** Último dia coberto: o domingo da semana atual. */
    fim: new Date(maisSemanas(atual, 1).getTime() - 864e5),
  };
}

/**
 * A semana do comparativo: a última semana **fechada** do calendário, segunda a
 * domingo. Gerando numa terça 22/09, é 14–20/09 contra 07–13/09.
 *
 * A semana corrente nunca entra, nem que já tenha auditoria: ela ainda está
 * enchendo, e comparar 2 dias com 7 leria volume como desempenho.
 */
export const semanaPassada = (hoje = referencia()) => maisSemanas(segunda(hoje), -1);

/**
 * Acumulado do mês: auditorias feitas do dia 1 até o **domingo da semana
 * atual**. Gerando em 22/09, é 01–20/09. Os dias entre o domingo e a data de
 * geração ficam de fora pelo mesmo motivo da semana corrente: estão enchendo.
 *
 * O comparativo é o mesmo recorte de dias do mês anterior (01→06 contra 01→06),
 * não o mês fechado: comparar 6 dias com 31 leria calendário como desempenho,
 * o mesmo erro que o deslocamento semanal existe para evitar. Mês anterior mais
 * curto (fev) trunca no último dia dele, e `dias` sai diferente entre os dois —
 * por isso o cabeçalho imprime as duas contagens.
 */
export function mesAteData(s: { fim: Date }) {
  const y = s.fim.getUTCFullYear();
  const m = s.fim.getUTCMonth();
  const d = s.fim.getUTCDate();
  const ultimoAnt = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const antFim = new Date(Date.UTC(y, m - 1, Math.min(d, ultimoAnt)));
  return {
    inicio: new Date(Date.UTC(y, m, 1)),
    fim: s.fim,
    dias: d,
    antInicio: new Date(Date.UTC(y, m - 1, 1)),
    antFim,
    diasAnt: antFim.getUTCDate(),
  };
}

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
    // max: 1 garante que as #temp sobrevivam entre as queries (mesma sessão).
    pool: { max: 1, min: 1, idleTimeoutMillis: 300_000 },
    options: { encrypt: true, trustServerCertificate: process.env.DB_TRUST_CERT === "true" },
    connectionTimeout: 30_000,
    requestTimeout: 180_000,
  });
}


/** `marca_ia` é extraída por IA do texto livre: modelo vira marca (Tiggo) e
 *  grafia varia (Cherry, Shagan). Marca nova com erro aparece como linha própria. */
const MARCA: Record<string, string> = { Cherry: "Chery", Tiggo: "Chery", Shagan: "Changan" };

const contar = (linhas: { marca: string }[]) => {
  const c = new Map<string, number>();
  for (const r of linhas) c.set(r.marca, (c.get(r.marca) ?? 0) + 1);
  return c;
};

const q = (pool: sql.ConnectionPool) => async <T>(text: string): Promise<T[]> =>
  (await pool.request().query(text)).recordset as T[];

const nps = (p: number, d: number, t: number) => (t ? Math.round(((p - d) / t) * 1000) / 10 : 0);
const taxa = (sim: number, nao: number) => (sim + nao ? Math.round((sim / (sim + nao)) * 1000) / 10 : 0);

/** Contagens que fecham um bloco de KPIs — de uma semana, de um mês ou de uma regional. */
type Contagem = {
  sim: number;
  nao: number;
  prom: number;
  detr: number;
  nNps: number;
  aud: number;
  vendas: number;
  conc: number;
  naoFoi: number;
};

/** As mesmas colunas de `Contagem`, em SQL. Uma definição só: semana, mês e
 *  regional têm de medir a mesma coisa, ou a página 3 não conversa com a 1. */
const CONTAGEM = `
  SUM(CASE WHEN contato = 'Sim' THEN 1 ELSE 0 END) AS sim,
  SUM(CASE WHEN contato = 'Não' THEN 1 ELSE 0 END) AS nao,
  SUM(CASE WHEN nps >= 9 THEN 1 ELSE 0 END) AS prom,
  SUM(CASE WHEN nps <= 6 THEN 1 ELSE 0 END) AS detr,
  SUM(CASE WHEN nps IS NOT NULL THEN 1 ELSE 0 END) AS nNps,
  COUNT(*) AS aud,
  SUM(CASE WHEN venda = 1 THEN 1 ELSE 0 END) AS vendas,
  SUM(CASE WHEN status LIKE '%outra marca%' THEN 1 ELSE 0 END) AS conc,
  SUM(CASE WHEN status LIKE '%Não fui%' THEN 1 ELSE 0 END) AS naoFoi`;

/**
 * Vendas perdidas, fórmula do dashboard: conversão × quem respondeu "não houve
 * contato", somada a quem declarou compra na concorrência.
 *
 * Tudo sai da **amostra auditada** — a conversão também. Antes a conversão vinha
 * de `vw_volks_leads` (a rede inteira, por data de criação), mas com o recorte na
 * data da auditoria não existe denominador da rede que case com a semana. Um
 * grão só, e nenhum número da rede ao lado de contagem de amostra (ver
 * CLAUDE.md, "Não faça").
 */
function bloco(c: Partial<Contagem> = {}) {
  const sim = c.sim ?? 0;
  const nao = c.nao ?? 0;
  const aud = c.aud ?? 0;
  const vendas = c.vendas ?? 0;
  const conc = c.conc ?? 0;
  const atendimento = Math.round(nao * (aud ? vendas / aud : 0));
  const perdas = atendimento + conc;
  return {
    txContato: taxa(sim, nao),
    nContato: sim + nao,
    semContato: nao,
    npsGeral: nps(c.prom ?? 0, c.detr ?? 0, c.nNps ?? 0),
    nNps: c.nNps ?? 0,
    auditados: aud,
    vendas,
    txVendas: aud ? Math.round((vendas / aud) * 1000) / 10 : 0,
    perdas,
    perdasAtendimento: atendimento,
    perdasConcorrencia: conc,
    faturamentoPerdido: perdas * TICKET_MEDIO,
    naoFoiALoja: c.naoFoi ?? 0,
  };
}

export async function carregar(pool: sql.ConnectionPool) {
  const s = janela(semanaPassada());
  const m = mesAteData(s);
  // No stdout porque é o que o agendador usa para nomear o arquivo, e o que o
  // humano confere de relance no log.
  console.log(`→ semana ${iso(s.atual)} a ${iso(s.fim)} · mês ${iso(m.inicio)} a ${iso(m.fim)}`);
  const A = `'${iso(s.atual)}'`;
  const B = `'${iso(s.anterior)}'`;
  const INI = `'${iso(s.janelaInicio)}'`;

  /** Dia da auditoria. `data` é datetime2: comparar direto com '2026-09-20'
   *  cortaria tudo que foi auditado depois da meia-noite do último dia. */
  const DIA = `CAST(${DATA} AS DATE)`;

  // Recorte do mês anterior que começa antes da mudança do questionário não é
  // comparável: sai inteiro, em vez de sobrar só a ponta posterior ao corte
  // (17–20/08 contra 01–20/09 compararia 4 dias com 20).
  const mesAntValido = iso(m.antInicio) >= INICIO_QUESTIONARIO;
  const MES = `CASE
    WHEN ${DIA} BETWEEN '${iso(m.inicio)}' AND '${iso(m.fim)}' THEN 'atual'
    ${mesAntValido ? `WHEN ${DIA} BETWEEN '${iso(m.antInicio)}' AND '${iso(m.antFim)}' THEN 'anterior'` : ""}
  END`;

  /** Janela acumulada dos cortes finos: (janelaInicio, semana atual]. */
  const JANELA = `${SEM} <= ${A} AND ${SEM} > ${INI}`;

  // A #temp cobre a mais antiga das duas janelas: a de 8 semanas e o recorte do
  // mês anterior. Elas quase coincidem, e quando o mês anterior é o mais antigo
  // a #temp sem essa folga devolveria um acumulado silenciosamente truncado.
  const maisAntigo = iso(new Date(Math.min(+s.janelaInicio, +m.antInicio)));
  const DESDE = maisAntigo > INICIO_QUESTIONARIO ? maisAntigo : INICIO_QUESTIONARIO;
  // Primeira semana que a janela de fato lê: a de 8 semanas, ou a da mudança do
  // questionário se ela for mais recente. O cabeçalho da página 2 imprime isso.
  const primeira = maisSemanas(s.janelaInicio, 1);
  const inicioLido = iso(primeira) > INICIO_QUESTIONARIO ? iso(primeira) : INICIO_QUESTIONARIO;

  await pool.request().batch(`
    IF OBJECT_ID('tempdb..#aud') IS NOT NULL DROP TABLE #aud;
    SELECT * INTO #aud FROM vw_volks_leads_auditados
    WHERE auditado = 'Sim' AND ${DIA} BETWEEN '${DESDE}' AND '${iso(s.fim)}'
    OPTION (HASH JOIN);
  `);
  const run = q(pool);

  const [serie, statusJanela, tempoJanela, npsTempo, regiaoSem, dnJanela, origemJanela, mes, regiaoMes, desfechoMes, marcasRaw] =
    await Promise.all([
      // Série semanal: responde "as taxas estão crescendo?" sem depender de dois
      // pontos. As duas últimas linhas são também o comparativo.
      run<Contagem & { semana: Date }>(`
        SELECT ${SEM} AS semana, ${CONTAGEM}
        FROM #aud WHERE ${JANELA}
        GROUP BY ${SEM} ORDER BY semana`),

      run<{ rotulo: string; n: number }>(`
        SELECT status AS rotulo, COUNT(*) AS n FROM #aud
        WHERE status IS NOT NULL AND ${JANELA}
        GROUP BY status ORDER BY COUNT(*) DESC`),

      // "Não recebi contato" é uma 5ª resposta possível de `tempo` — não é
      // velocidade de atendimento, é ausência dele (já coberto pela taxa de
      // contato). Incluí-la no denominador infla "X% demoram mais de um dia"
      // com gente que não foi atendida.
      run<{ rotulo: string; n: number }>(`
        SELECT tempo AS rotulo, COUNT(*) AS n FROM #aud
        WHERE tempo IS NOT NULL AND tempo <> 'Não recebi contato' AND ${JANELA}
        GROUP BY tempo`),

      run<{ rotulo: string; prom: number; detr: number; n: number }>(`
        SELECT tempo AS rotulo,
          SUM(CASE WHEN nps >= 9 THEN 1 ELSE 0 END) AS prom,
          SUM(CASE WHEN nps <= 6 THEN 1 ELSE 0 END) AS detr,
          COUNT(*) AS n
        FROM #aud WHERE nps IS NOT NULL AND tempo IS NOT NULL AND ${JANELA}
        GROUP BY tempo`),

      // Regional entra nas duas semanas do comparativo: é o único corte fino que
      // sustenta amostra semanal (~30 a 40 respostas por regional).
      run<Contagem & { semana: Date; regional: number }>(`
        SELECT ${SEM} AS semana, regional, ${CONTAGEM}
        FROM #aud WHERE regional IS NOT NULL AND ${SEM} IN (${A}, ${B})
        GROUP BY ${SEM}, regional`),

      // Nome fantasia se repete entre DNs (Green Automoveis tem três) — o rótulo
      // carrega o código, senão parece linha duplicada.
      run<{ nome: string; dn: string; sim: number; nao: number }>(`
        SELECT dn_nome_fantasia AS nome, dn,
          SUM(CASE WHEN contato = 'Sim' THEN 1 ELSE 0 END) AS sim,
          SUM(CASE WHEN contato = 'Não' THEN 1 ELSE 0 END) AS nao
        FROM #aud WHERE dn IS NOT NULL AND ${JANELA}
        GROUP BY dn_nome_fantasia, dn`),

      run<{ rotulo: string; sim: number; nao: number }>(`
        SELECT sub_origem AS rotulo,
          SUM(CASE WHEN contato = 'Sim' THEN 1 ELSE 0 END) AS sim,
          SUM(CASE WHEN contato = 'Não' THEN 1 ELSE 0 END) AS nao
        FROM #aud WHERE sub_origem IS NOT NULL AND ${JANELA}
        GROUP BY sub_origem`),

      // ── acumulado do mês ────────────────────────────────────────────────
      // Mesma CONTAGEM da semana, cortada por dia: a semana do comparativo pode
      // atravessar a virada do mês, e agrupar por semana jogaria dias de um mês
      // dentro do outro.
      run<Contagem & { bucket: string }>(`
        SELECT ${MES} AS bucket, ${CONTAGEM}
        FROM #aud WHERE ${MES} IS NOT NULL
        GROUP BY ${MES}`),

      run<Contagem & { bucket: string; regional: number }>(`
        SELECT ${MES} AS bucket, regional, ${CONTAGEM}
        FROM #aud WHERE regional IS NOT NULL AND ${MES} IS NOT NULL
        GROUP BY ${MES}, regional`),

      // Desfecho no grão mensal. A página 2 mostra o mesmo corte em 8 semanas,
      // mas sem comparação nenhuma — é aqui que "mudou?" ganha resposta.
      run<{ bucket: string; rotulo: string; n: number }>(`
        SELECT ${MES} AS bucket, status AS rotulo, COUNT(*) AS n
        FROM #aud WHERE status IS NOT NULL AND ${MES} IS NOT NULL
        GROUP BY ${MES}, status`),

      // Marca do concorrente, uma linha por contato. `marca_ia` mora em
      // vw_volks_auditoria, que repete contato (já houve 32 linhas para um só):
      // sem o MAX por contato antes do join, uma resposta vira o topo do ranking.
      run<{ marca: string; semana: Date; bucket: string | null }>(`
        SELECT DISTINCT l.id_chat_campanha_contato, a.marca, ${SEM} AS semana, ${MES} AS bucket
        FROM #aud l JOIN (
          SELECT id_chat_campanha_contato, MAX(NULLIF(LTRIM(RTRIM(marca_ia)), '')) AS marca
          FROM vw_volks_auditoria GROUP BY id_chat_campanha_contato
        ) a ON a.id_chat_campanha_contato = l.id_chat_campanha_contato
        WHERE a.marca IS NOT NULL`),
    ]);

  const chave = (d: Date) => iso(new Date(d));
  const kA = iso(s.atual);
  const kB = iso(s.anterior);

  const semana = (k: string) => ({ inicio: k, ...bloco(serie.find((r) => chave(r.semana) === k)) });
  const atual = semana(kA);

  // Sem auditoria na semana passada o relatório sairia com todo KPI em 0,0% —
  // um PDF plausível e errado, que o agendador publicaria sem ninguém olhar.
  // Falhar aqui é o ponto.
  if (atual.auditados === 0)
    throw new Error(
      `Nenhuma auditoria realizada entre ${kA} e ${iso(s.fim)}. ` +
        `A carga de vw_volks_leads_auditados provavelmente atrasou — confira MAX(data). ` +
        `Para reprocessar uma rodada antiga: HOJE=AAAA-MM-DD.`,
    );

  const porRegional = (linhas: (Contagem & { regional: number })[], chaveAtual: (r: any) => boolean, chaveAnt: (r: any) => boolean) =>
    [1, 2, 3, 4, 5, 6].map((reg) => {
      const linha = (sel: (r: any) => boolean) => {
        const b = bloco(linhas.find((r) => r.regional === reg && sel(r)));
        return { tx: b.txContato, n: b.nContato, semContato: b.semContato, perdas: b.perdas };
      };
      return { regional: String(reg), atual: linha(chaveAtual), anterior: linha(chaveAnt) };
    });

  const totalStatus = statusJanela.reduce((a, b) => a + b.n, 0);
  const totalTempo = tempoJanela.reduce((a, b) => a + b.n, 0);

  const desfecho = (() => {
    const total = (b: string) => desfechoMes.filter((r) => r.bucket === b).reduce((a, r) => a + r.n, 0);
    const tA = total("atual");
    const tB = total("anterior");
    return desfechoMes
      .filter((r) => r.bucket === "atual")
      .map((r) => {
        const nAnt = desfechoMes.find((x) => x.bucket === "anterior" && x.rotulo === r.rotulo)?.n ?? 0;
        const pct = tA ? (r.n / tA) * 100 : 0;
        const pctAnt = tB ? (nAnt / tB) * 100 : 0;
        return { motivo: r.rotulo, n: r.n, pct, pctAnt, dif: pct - pctAnt, nAnt };
      })
      .sort((a, b) => b.n - a.n);
  })();

  const marcas = marcasRaw.map((r) => ({ ...r, marca: MARCA[r.marca] ?? r.marca, semana: chave(r.semana) }));
  const naJanela = marcas.filter((r) => r.semana <= kA && r.semana > iso(s.janelaInicio));
  const vistasAntes = new Set(naJanela.filter((r) => r.semana < kA).map((r) => r.marca));
  const marcasMes = contar(marcas.filter((r) => r.bucket === "atual"));
  const marcasMesAnt = contar(marcas.filter((r) => r.bucket === "anterior"));

  return {
    periodo: {
      atual: kA,
      anterior: kB,
      /** Primeiro dia que a janela dos cortes finos lê. */
      janelaInicio: inicioLido,
      fim: iso(s.fim),
      /** Semanas que a janela de fato cobre: menos que SEMANAS_JANELA enquanto
       *  a mudança do questionário for mais recente que 8 semanas. */
      semanasJanela: Math.round((+s.atual - +new Date(inicioLido + "T00:00:00Z")) / (7 * 864e5)) + 1,
      inicioQuestionario: INICIO_QUESTIONARIO,
    },

    atual,
    anterior: semana(kB),

    /** Série inteira — a resposta a "está crescendo?" não sai de dois pontos. */
    serie: serie.map((r) => {
      const b = bloco(r);
      return { inicio: chave(r.semana), tx: b.txContato, n: b.nContato, nps: b.npsGeral, nNps: b.nNps };
    }),

    /** Motivo declarado: só sustenta acumulado — semanal a cauda tem 1 resposta. */
    motivo: statusJanela.map((r) => ({ motivo: r.rotulo, n: r.n, pct: totalStatus ? (r.n / totalStatus) * 100 : 0 })),
    totalMotivo: totalStatus,

    tempo: tempoJanela.map((r) => ({ tempo: r.rotulo, n: r.n, pct: totalTempo ? (r.n / totalTempo) * 100 : 0 })),
    totalTempo,

    /** A correlação central do relatório. Acumulado: semanal daria ~10 por faixa. */
    npsTempo: npsTempo
      .filter((r) => r.n >= PISO_AMOSTRA)
      .map((r) => ({ tempo: r.rotulo, nps: nps(r.prom, r.detr, r.n), n: r.n })),

    regional: porRegional(regiaoSem, (r) => chave(r.semana) === kA, (r) => chave(r.semana) === kB),

    /** Concessionárias com pior taxa de contato na janela, respeitando o piso. */
    piores: dnJanela
      .map((r) => ({ nome: r.nome ?? r.dn, dn: r.dn, tx: taxa(r.sim, r.nao), n: r.sim + r.nao, semContato: r.nao }))
      .filter((r) => r.n >= PISO_AMOSTRA)
      .sort((a, b) => a.tx - b.tx),

    origem: origemJanela
      .map((r) => ({ origem: r.rotulo, tx: taxa(r.sim, r.nao), n: r.sim + r.nao, semContato: r.nao }))
      .filter((r) => r.n >= PISO_AMOSTRA)
      .sort((a, b) => b.semContato - a.semContato),

    /** Auditorias feitas no mês até o domingo da semana atual, contra o mesmo
     *  recorte de dias do mês anterior. */
    mes: {
      inicio: iso(m.inicio),
      fim: iso(m.fim),
      antInicio: iso(m.antInicio),
      antFim: iso(m.antFim),
      dias: m.dias,
      diasAnt: m.diasAnt,
      atual: bloco(mes.find((r) => r.bucket === "atual")),
      anterior: bloco(mes.find((r) => r.bucket === "anterior")),
      regional: porRegional(regiaoMes, (r) => r.bucket === "atual", (r) => r.bucket === "anterior"),
      /** Em p.p. e não em contagem: os dois recortes têm total de respostas
       *  diferente, e "213 contra 188" leria volume de auditoria como mudança. */
      desfecho,
      totalDesfecho: desfechoMes.filter((r) => r.bucket === "atual").reduce((a, r) => a + r.n, 0),
    },

    /** Marca que o cliente nomeou ao dizer que comprou de outra — subconjunto
     *  pequeno (~5 por semana), por isso só janela e mês, e só em contagem. */
    concorrencia: {
      janela: [...contar(naJanela)].map(([marca, n]) => ({ marca, n })).sort((a, b) => b.n - a.n),
      /** Apareceu na semana atual sem registro nas semanas anteriores da janela. */
      novasSemana: [...new Set(naJanela.filter((r) => r.semana === kA && !vistasAntes.has(r.marca)).map((r) => r.marca))],
      mes: [...new Set([...marcasMes.keys(), ...marcasMesAnt.keys()])]
        .map((marca) => ({ marca, n: marcasMes.get(marca) ?? 0, nAnt: marcasMesAnt.get(marca) ?? 0 }))
        .sort((a, b) => b.n - a.n || b.nAnt - a.nAnt),
    },
  };
}

export type Dados = Awaited<ReturnType<typeof carregar>>;
