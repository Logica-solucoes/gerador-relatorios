/**
 * Vendas do banco do portal (`Basf`) → dados/_bruto/vendas.json.
 * Regra da BASF (05/10/2026), a mesma do PBI Sales: data da nota, só order_type SBB e SDB.
 * TH = inv_qty, também por pedido da BASF (em cebola e cenoura é 1/100 do inv_qty_alt).
 * Uso: bun --env-file=clients/basf/.env run web/basf/snapshot/vendas.ts
 * DB_NAME do .env é Basf-Relatorio; aqui forçamos o banco do portal.
 */
import sql from "mssql";

const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`${n} não definida`); return v; };

const pool = await sql.connect({
  server: req("DB_HOST"), port: Number(process.env.DB_PORT || 1433), user: req("DB_USER"), password: req("DB_PASS"), database: "Basf",
  options: { encrypt: true, trustServerCertificate: process.env.DB_TRUST_CERT === "true" },
  requestTimeout: 120000,
});

const linhas = (await pool.request().query(`
  SELECT YEAR(v.inv_date) ano, MONTH(v.inv_date) mes, DAY(v.inv_date) dia, v.kind, v.primary_contact rtvCod,
         f.nome rtvNome, v.cust_no custNo, v.cust_name cliente, v.item_desc item,
         SUM(v.total_line_amt) valor, SUM(v.inv_qty) th
  FROM basf_vendas v LEFT JOIN basf_fte f ON f.cod = v.primary_contact
  WHERE v.order_type IN ('SBB', 'SDB') AND v.inv_date IS NOT NULL
  GROUP BY YEAR(v.inv_date), MONTH(v.inv_date), DAY(v.inv_date), v.kind, v.primary_contact, f.nome,
           v.cust_no, v.cust_name, v.item_desc`)).recordset;

const [{ ultima }] = (await pool.request().query(`
  SELECT CONVERT(varchar(10), MAX(inv_date), 23) ultima FROM basf_vendas
  WHERE order_type IN ('SBB', 'SDB')`)).recordset;

await pool.close();
await Bun.write(`${AQUI}../dados/_bruto/vendas.json`, JSON.stringify({ ultimaVenda: ultima, linhas }));
console.log(`vendas: ${linhas.length} linhas, última venda ${ultima}`);
