/**
 * dados/*.json → tabelas basf_dash_* do banco do portal Basf. O portal só lê essas tabelas.
 * Uso: PORTAL_DB=Basf bun run dash:basf:banco
 * PORTAL_DB não tem default de propósito: este script apaga e regrava, e também roda contra a Azure.
 */
import sql from "mssql";
import type { TabelaFio } from "../src/types";

const RECURSOS = ["basf", "ibge", "abcsem", "cepea", "resumo", "resumoSeg", "clientes", "vendas", "meta", "municipios"];
const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`${n} não definida`); return v; };

const pool = await sql.connect({
  server: req("DB_HOST"), port: Number(process.env.DB_PORT || 1433), user: req("DB_USER"), password: req("DB_PASS"), database: req("PORTAL_DB"),
  options: { encrypt: true, trustServerCertificate: process.env.DB_TRUST_CERT === "true" },
  requestTimeout: 120_000,
});
const tx = new sql.Transaction(pool);
await tx.begin();
try {
  for (const r of RECURSOS) {
    const t = (await Bun.file(`${AQUI}../dados/${r}.json`).json()) as TabelaFio;
    const tabela = `basf_dash_${r}`;
    const cols = t.c.map((c) => `[${c}]`).join(", ");
    // TOP 0 traz os tipos das colunas do banco; o bulk usa eles.
    const molde = (await new sql.Request(tx).query(`SELECT TOP 0 ${cols} FROM ${tabela}`)).recordset.toTable(tabela);
    for (const linha of t.r) molde.rows.add(...linha);
    await new sql.Request(tx).query(`DELETE FROM ${tabela}`);
    await new sql.Request(tx).bulk(molde);

    // Ida e volta: o que o endpoint vai ler tem que ser igual ao snapshot, valor a valor e na ordem.
    const volta = (await new sql.Request(tx).query(`SELECT ${cols} FROM ${tabela} ORDER BY id`)).recordset;
    if (volta.length !== t.r.length) throw new Error(`${r}: ${volta.length} linhas no banco, ${t.r.length} no snapshot`);
    t.r.forEach((linha, i) => {
      const lida = t.c.map((c) => volta[i][c]);
      if (JSON.stringify(lida) !== JSON.stringify(linha)) throw new Error(`${r}, linha ${i}: ${JSON.stringify(lida)} ≠ ${JSON.stringify(linha)}`);
    });
    console.log(`${r}: ${volta.length} linhas`);
  }
  await tx.commit();
} catch (e) {
  await tx.rollback();
  throw e;
} finally {
  await pool.close();
}
