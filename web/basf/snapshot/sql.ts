/**
 * dados/*.json → out/basf_dash_carga.sql, para rodar no SSMS quando não há credencial da Azure
 * nesta máquina. Mesmo resultado do banco.ts: apaga e regrava as basf_dash_*, numa transação só.
 * Uso: bun run dash:basf:sql
 */
import { mkdirSync } from "node:fs";
import type { TabelaFio } from "../src/types";

const RECURSOS = ["basf", "ibge", "abcsem", "cepea", "resumo", "resumoSeg", "clientes", "vendas", "meta", "municipios"];
const INTEIRAS = new Set(["ano", "mes", "dia", "cod", "selecionado"]);
const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SAIDA = `${AQUI}../../../out/basf_dash_carga.sql`;

// `E0` faz o SQL Server ler como float direto; sem ele o literal vira decimal e pode arredondar diferente.
const valor = (v: unknown, col: string) =>
  v == null ? "NULL"
  : typeof v === "string" ? `N'${v.replaceAll("'", "''")}'`
  : INTEIRAS.has(col) || /e/i.test(String(v)) ? String(v)
  : `${v}E0`;

const partes = ["SET NOCOUNT ON;", "SET XACT_ABORT ON;", "BEGIN TRAN;"];
for (const r of RECURSOS) {
  const t = (await Bun.file(`${AQUI}../dados/${r}.json`).json()) as TabelaFio;
  const tabela = `basf_dash_${r}`;
  partes.push(`DELETE FROM ${tabela};`);
  // INSERT ... VALUES aceita no máximo 1000 linhas.
  for (let i = 0; i < t.r.length; i += 1000) {
    const linhas = t.r.slice(i, i + 1000).map((l) => `(${l.map((v, j) => valor(v, t.c[j]!)).join(",")})`);
    partes.push(`INSERT ${tabela} (${t.c.map((c) => `[${c}]`).join(",")}) VALUES\n${linhas.join(",\n")};`);
  }
}
partes.push("COMMIT;");
partes.push(RECURSOS.map((r) => `SELECT '${r}' AS recurso, COUNT(*) AS linhas FROM basf_dash_${r}`).join("\nUNION ALL ") + ";");

mkdirSync(`${AQUI}../../../out`, { recursive: true });
await Bun.write(SAIDA, partes.join("\n") + "\n");
console.log(`${SAIDA} (${(Bun.file(SAIDA).size / 1e6).toFixed(1)} MB)`);
