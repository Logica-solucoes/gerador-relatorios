import sql from "mssql";

// Dados vao ate 25/06/2026 -> YTD = jan..jun nos dois anos comparados.
export const YTD_MES = 6;
export const ANO = 2026;
export const ANO_ANT = 2025;

/** Sem default: conectar no banco errado em silêncio é pior que falhar na hora. */
function req(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não definida. Configure o .env (veja .env.example).`);
  return v;
}

export async function conectar() {
  return sql.connect({
    server: req("DB_HOST"),
    user: req("DB_USER"),
    password: req("DB_PASS"),
    database: req("DB_NAME"),
    options: {
      encrypt: true,
      // Azure SQL tem certificado válido — validar de verdade. Só instância
      // local com cert self-signed precisa de DB_TRUST_CERT=true, e isso
      // jamais deve ser ligado apontando para a Azure.
      trustServerCertificate: process.env.DB_TRUST_CERT === "true",
    },
    connectionTimeout: 30000, // Azure serverless pode estar despausando
    requestTimeout: 120000,
  });
}

const q = (pool: sql.ConnectionPool) => async <T>(text: string): Promise<T[]> =>
  (await pool.request().query(text)).recordset as T[];

export async function carregar(pool: sql.ConnectionPool) {
  const run = q(pool);

  // Contas de teste ("...-DUMMY") existem na base e chegam a R$ 1 Mi/ano.
  // Ficam de fora de TODO recorte, senao os numeros nao reconciliam entre paginas.
  const REAL = `cust_name NOT LIKE '%DUMMY%'`;
  const YTD = `MONTH(inv_date)<=${YTD_MES} AND YEAR(inv_date) IN (${ANO_ANT},${ANO}) AND ${REAL}`;
  const A26 = `YEAR(inv_date)=${ANO} AND ${REAL}`;
  const A25 = `YEAR(inv_date)=${ANO_ANT} AND ${REAL}`;
  const BR = `ship_to_country='BR'`;

  const [
    kpis,
    mensalMercado,
    bridge,
    precoVolume,
    precoCultura,
    tratamento,
    pareto,
    coorte,
    frequencia,
    dormentes,
    spread,
    dispersao,
    vazamento,
    abaixoMedia,
    culturasPorCliente,
    monoCultura,
    devolucoes,
    urgencia,
    operacional,
  ] = await Promise.all([
    // --- P1: KPIs de capa -------------------------------------------------
    run<{ ano: number; fat: number; vol: number; clientes: number; pedidos: number }>(`
      SELECT YEAR(inv_date) ano, SUM(total_line_amt) fat, SUM(inv_qty_th) vol,
             COUNT(DISTINCT cust_no) clientes, COUNT(DISTINCT order_no) pedidos
      FROM basf_vendas WHERE ${YTD} GROUP BY YEAR(inv_date)`),

    // --- P3: serie mensal, BR x export ------------------------------------
    run<{ ano: number; mes: number; mercado: string; fat: number; vol: number }>(`
      SELECT YEAR(inv_date) ano, MONTH(inv_date) mes,
             CASE WHEN ship_to_country='BR' THEN 'Brasil' ELSE 'Export' END mercado,
             SUM(total_line_amt) fat, SUM(inv_qty_th) vol
      FROM basf_vendas WHERE YEAR(inv_date) BETWEEN 2022 AND ${ANO} AND ${REAL}
      GROUP BY YEAR(inv_date), MONTH(inv_date),
               CASE WHEN ship_to_country='BR' THEN 'Brasil' ELSE 'Export' END
      ORDER BY 1,2,3`),

    // --- P2: waterfall da queda -------------------------------------------
    // Decompoe 2025->2026 em: export, clientes BR perdidos, retidos BR, novos BR.
    run<{ etapa: string; valor: number }>(`
      WITH y AS (
        SELECT cust_no,
               CASE WHEN ship_to_country='BR' THEN 'BR' ELSE 'EX' END mkt,
               SUM(CASE WHEN YEAR(inv_date)=${ANO_ANT} THEN total_line_amt ELSE 0 END) f25,
               SUM(CASE WHEN YEAR(inv_date)=${ANO}     THEN total_line_amt ELSE 0 END) f26
        FROM basf_vendas WHERE ${YTD}
        GROUP BY cust_no, CASE WHEN ship_to_country='BR' THEN 'BR' ELSE 'EX' END)
      -- particao exaustiva: as 4 etapas somadas ao YTD 2025 fecham exatamente no YTD 2026
      SELECT 'YTD ${ANO_ANT}' etapa, SUM(f25) valor FROM y
      UNION ALL SELECT 'Export (intercompany)', SUM(f26-f25) FROM y WHERE mkt='EX'
      UNION ALL SELECT 'Clientes perdidos',     SUM(-f25)    FROM y WHERE mkt='BR' AND f26=0
      UNION ALL SELECT 'Retidos (variacao)',    SUM(f26-f25) FROM y WHERE mkt='BR' AND f26<>0 AND f25<>0
      UNION ALL SELECT 'Clientes novos',        SUM(f26)     FROM y WHERE mkt='BR' AND f25=0 AND f26<>0
      UNION ALL SELECT 'YTD ${ANO}',            SUM(f26)     FROM y`),

    // --- P4: receita x volume por mercado ---------------------------------
    run<{ ano: number; mercado: string; fat: number; vol: number }>(`
      SELECT YEAR(inv_date) ano,
             CASE WHEN ship_to_country='BR' THEN 'Brasil' ELSE 'Export' END mercado,
             SUM(total_line_amt) fat, SUM(inv_qty_th) vol
      FROM basf_vendas WHERE ${YTD}
      GROUP BY YEAR(inv_date), CASE WHEN ship_to_country='BR' THEN 'Brasil' ELSE 'Export' END`),

    // --- P4: erosao de preco por cultura ----------------------------------
    run<{ ano: number; cultura: string; preco: number; vol: number }>(`
      SELECT YEAR(inv_date) ano, kind cultura,
             SUM(total_line_amt)/NULLIF(SUM(inv_qty_th),0) preco, SUM(inv_qty_th) vol
      FROM basf_vendas
      WHERE kind IN ('WMW','MEM','TOF','ONS','CAC') AND YEAR(inv_date) BETWEEN 2024 AND ${ANO} AND ${REAL}
        AND inv_qty_th > 0
      GROUP BY YEAR(inv_date), kind ORDER BY 2,1`),

    // --- P4: mix de tratamento (margem escondida) -------------------------
    run<{ tratamento: string; fat: number; preco: number }>(`
      SELECT TOP 7 seed_form_desc tratamento, SUM(total_line_amt) fat,
             SUM(total_line_amt)/NULLIF(SUM(inv_qty_th),0) preco
      FROM basf_vendas WHERE ${A26} AND inv_qty_th>0 AND seed_form_desc IS NOT NULL
      GROUP BY seed_form_desc HAVING SUM(total_line_amt)>100000 ORDER BY 2 DESC`),

    // --- P5: pareto de concentracao ---------------------------------------
    run<{ cliente: string; fat: number; acum: number }>(`
      WITH c AS (SELECT cust_name nome, SUM(total_line_amt) f
                 FROM basf_vendas WHERE ${A26} GROUP BY cust_name)
      SELECT TOP 12 nome cliente, f fat,
             100.0*SUM(f) OVER(ORDER BY f DESC ROWS UNBOUNDED PRECEDING)/SUM(f) OVER() acum
      FROM c ORDER BY f DESC`),

    // --- P5: coorte de clientes -------------------------------------------
    run<{ status: string; clientes: number; fat: number }>(`
      -- mesma janela YTD do resto do relatorio, senao nao bate com o waterfall
      WITH hist AS (SELECT DISTINCT cust_no FROM basf_vendas WHERE YEAR(inv_date)<${ANO_ANT} AND ${REAL}),
           y25  AS (SELECT DISTINCT cust_no FROM basf_vendas WHERE ${A25} AND MONTH(inv_date)<=${YTD_MES}),
           y26  AS (SELECT cust_no, SUM(total_line_amt) f FROM basf_vendas
                    WHERE ${A26} AND MONTH(inv_date)<=${YTD_MES} GROUP BY cust_no),
           tag  AS (SELECT f, CASE WHEN cust_no IN (SELECT cust_no FROM y25) THEN 'Retido'
                                   WHEN cust_no IN (SELECT cust_no FROM hist) THEN 'Reativado'
                                   ELSE 'Novo' END status FROM y26)
      SELECT status, COUNT(*) clientes, SUM(f) fat FROM tag GROUP BY status
      UNION ALL
      SELECT 'Perdido', COUNT(*), -SUM(f) FROM (
        SELECT cust_no, SUM(total_line_amt) f FROM basf_vendas
        WHERE ${A25} AND MONTH(inv_date)<=${YTD_MES}
        AND cust_no NOT IN (SELECT cust_no FROM basf_vendas WHERE ${A26} AND MONTH(inv_date)<=${YTD_MES})
        GROUP BY cust_no) p`),

    // --- P5: frequencia de compra -----------------------------------------
    run<{ meses: number; clientes: number; fat: number }>(`
      WITH f AS (SELECT cust_no, COUNT(DISTINCT MONTH(inv_date)) m, SUM(total_line_amt) v
                 FROM basf_vendas WHERE ${A26} GROUP BY cust_no)
      SELECT m meses, COUNT(*) clientes, SUM(v) fat FROM f GROUP BY m ORDER BY 1`),

    // --- P6: dormentes ------------------------------------------------------
    run<{ cliente: string; fat25: number; ultima: Date; dias: number }>(`
      SELECT TOP 10 cust_name cliente, SUM(total_line_amt) fat25, MAX(inv_date) ultima,
             DATEDIFF(day, MAX(inv_date), '${ANO}-06-25') dias
      FROM basf_vendas WHERE ${A25}
        AND cust_no NOT IN (SELECT DISTINCT cust_no FROM basf_vendas WHERE ${A26})
      GROUP BY cust_name ORDER BY 2 DESC`),

    // --- P7: spread de preco por SKU ----------------------------------------
    // Agrupa por (item, embalagem) senao desconto legitimo de volume vira "spread".
    // Exclui NON SEEDS: preco por mil sementes nao faz sentido em servico.
    run<{ item: string; pack: string; clientes: number; pmin: number; pmax: number; spread: number; fat: number }>(`
      SELECT TOP 8 MAX(item_desc) item, MAX(pack_desc) pack, COUNT(DISTINCT cust_no) clientes,
             MIN(net_price_th_inv_cur) pmin, MAX(net_price_th_inv_cur) pmax,
             100.0*(MAX(net_price_th_inv_cur)-MIN(net_price_th_inv_cur))/MAX(net_price_th_inv_cur) spread,
             SUM(total_line_amt) fat
      FROM basf_vendas WHERE ${A26} AND ${BR} AND net_price_th_inv_cur>0
        AND seed_size_desc<>'NON SEEDS' AND pack_desc<>'NON SEEDS'
      GROUP BY item_no, pack_desc
      HAVING COUNT(DISTINCT cust_no)>=6 AND SUM(total_line_amt)>200000
      ORDER BY spread DESC`),

    // --- P7: dispersao no SKU de maior faturamento --------------------------
    run<{ cliente: string; preco: number; vol: number; item: string }>(`
      WITH top1 AS (SELECT TOP 1 item_no, pack_desc FROM basf_vendas
                    WHERE ${A26} AND ${BR} AND net_price_th_inv_cur>0
                      AND seed_size_desc<>'NON SEEDS' AND pack_desc<>'NON SEEDS'
                    GROUP BY item_no, pack_desc ORDER BY SUM(total_line_amt) DESC)
      SELECT MAX(v.cust_name) cliente, SUM(v.total_line_amt)/SUM(v.inv_qty_th) preco,
             SUM(v.inv_qty_th) vol, MAX(v.item_desc) item
      FROM basf_vendas v JOIN top1 t ON t.item_no=v.item_no AND t.pack_desc=v.pack_desc
      WHERE YEAR(v.inv_date)=${ANO} AND v.${BR} AND v.inv_qty_th>0
      GROUP BY v.cust_no ORDER BY 2`),

    // --- P7: estimativa conservadora de recuperacao -------------------------
    // Quanto entraria se quem paga ABAIXO da mediana do proprio SKU pagasse a mediana.
    run<{ gap_mediana: number; gap_maximo: number }>(`
      WITH p AS (
        SELECT total_line_amt, inv_qty_th, net_price_th_inv_cur,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY net_price_th_inv_cur)
                 OVER (PARTITION BY item_no, pack_desc) med,
               MAX(net_price_th_inv_cur) OVER (PARTITION BY item_no, pack_desc) mx
        FROM basf_vendas WHERE ${A26} AND ${BR} AND net_price_th_inv_cur>0
          AND seed_size_desc<>'NON SEEDS' AND pack_desc<>'NON SEEDS')
      SELECT SUM(CASE WHEN net_price_th_inv_cur<med THEN (med-net_price_th_inv_cur)*inv_qty_th ELSE 0 END) gap_mediana,
             SUM((mx-net_price_th_inv_cur)*inv_qty_th) gap_maximo
      FROM p`),

    // --- P7: quem paga abaixo da media --------------------------------------
    run<{ cliente: string; desvio: number; fat: number }>(`
      WITH m AS (SELECT item_no, AVG(net_price_th_inv_cur) pm FROM basf_vendas
                 WHERE ${A26} AND ${BR} AND net_price_th_inv_cur>0 GROUP BY item_no)
      SELECT TOP 8 v.cust_name cliente,
             AVG(100.0*(v.net_price_th_inv_cur-m.pm)/m.pm) desvio, SUM(v.total_line_amt) fat
      FROM basf_vendas v JOIN m ON m.item_no=v.item_no
      WHERE YEAR(v.inv_date)=${ANO} AND v.${BR} AND v.net_price_th_inv_cur>0
      GROUP BY v.cust_name HAVING COUNT(*)>=5 AND SUM(v.total_line_amt)>200000 ORDER BY 2`),

    // --- P8: ticket medio por amplitude de culturas -------------------------
    run<{ culturas: number; clientes: number; ticket: number; fat: number }>(`
      WITH c AS (SELECT cust_no, COUNT(DISTINCT kind) k, SUM(total_line_amt) f
                 FROM basf_vendas WHERE ${A26} AND ${BR} AND kind IS NOT NULL
                 GROUP BY cust_no)
      SELECT CASE WHEN k>=3 THEN 3 ELSE k END culturas, COUNT(*) clientes,
             AVG(f) ticket, SUM(f) fat
      FROM c GROUP BY CASE WHEN k>=3 THEN 3 ELSE k END ORDER BY 1`),

    // --- P8: alvos nominais de cross-sell -----------------------------------
    run<{ cliente: string; cultura: string; fat: number }>(`
      WITH c AS (SELECT cust_name nome, MAX(kind) unica, SUM(total_line_amt) f
                 FROM basf_vendas WHERE ${A26} AND ${BR} AND kind IS NOT NULL
                 GROUP BY cust_name HAVING COUNT(DISTINCT kind)=1)
      SELECT TOP 8 nome cliente, unica cultura, f fat FROM c ORDER BY f DESC`),

    // --- P9: devolucoes -----------------------------------------------------
    run<{ ano: number; valor: number; perc: number }>(`
      SELECT YEAR(inv_date) ano, -SUM(total_line_amt) valor,
             -100.0*SUM(total_line_amt)/NULLIF((SELECT SUM(total_line_amt) FROM basf_vendas v2
               WHERE YEAR(v2.inv_date)=YEAR(v.inv_date) AND v2.total_line_amt>0),0) perc
      FROM basf_vendas v WHERE total_line_amt<0 GROUP BY YEAR(inv_date) ORDER BY 1`),

    // --- P9: pedidos de ultima hora -----------------------------------------
    run<{ ano: number; perc: number; media: number }>(`
      SELECT YEAR(inv_date) ano,
             100.0*SUM(CASE WHEN DATEDIFF(day,cust_order_date,cust_req_date)<=1 THEN 1 ELSE 0 END)/COUNT(*) perc,
             AVG(CAST(DATEDIFF(day,cust_order_date,cust_req_date) AS float)) media
      FROM basf_vendas WHERE ${BR} AND cust_order_date IS NOT NULL
      GROUP BY YEAR(inv_date) ORDER BY 1`),

    // --- P9: numeros soltos de qualidade operacional ------------------------
    run<{ metrica: string; valor: number }>(`
      SELECT 'sales_error' metrica, -SUM(total_line_amt) valor FROM basf_vendas
        WHERE ${A26} AND total_line_amt<0 AND reason_desc='SALES ERROR'
      UNION ALL SELECT 'fat_apos_req',
        100.0*SUM(CASE WHEN inv_date>cust_req_date THEN 1.0 ELSE 0 END)/COUNT(*)
        FROM basf_vendas WHERE ${A26} AND cust_req_date IS NOT NULL
      UNION ALL SELECT 'itens_80pc', (SELECT COUNT(*) FROM (
          SELECT item_no, SUM(f) OVER(ORDER BY f DESC ROWS UNBOUNDED PRECEDING) ac, SUM(f) OVER() tot
          FROM (SELECT item_no, SUM(total_line_amt) f FROM basf_vendas WHERE ${A26} GROUP BY item_no) i
        ) r WHERE ac <= 0.8*tot)
      UNION ALL SELECT 'itens_total', COUNT(DISTINCT item_no) FROM basf_vendas WHERE ${A26}
      UNION ALL SELECT 'sku_2025', COUNT(DISTINCT item_no) FROM basf_vendas WHERE ${A25}
      UNION ALL SELECT 'cli_vendedor_br90',
        COUNT(DISTINCT cust_no) FROM basf_vendas WHERE ${A26} AND sales_person='BR90'
      UNION ALL SELECT 'cli_total', COUNT(DISTINCT cust_no) FROM basf_vendas WHERE ${A26}
      UNION ALL SELECT 'contrato_pc',
        100.0*SUM(CASE WHEN agr_no IS NOT NULL THEN 1.0 ELSE 0 END)/COUNT(*)
        FROM basf_vendas WHERE ${A26} AND ${BR}`),
  ]);

  return {
    kpis, mensalMercado, bridge, precoVolume, precoCultura, tratamento,
    pareto, coorte, frequencia, dormentes, spread, dispersao, abaixoMedia,
    culturasPorCliente, monoCultura, devolucoes, urgencia,
    vazamento: vazamento[0]!,
    // Chaves explícitas: com Record<string, number> o tsc devolve `undefined`
    // em toda leitura, e um typo na métrica só apareceria no PDF.
    operacional: Object.fromEntries(operacional.map((r) => [r.metrica, r.valor])) as Record<
      | "sales_error" | "fat_apos_req" | "itens_80pc" | "itens_total"
      | "sku_2025" | "cli_vendedor_br90" | "cli_total" | "contrato_pc",
      number
    >,
  };
}

export type Dados = Awaited<ReturnType<typeof carregar>>;
