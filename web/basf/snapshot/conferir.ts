/** Reconciliação com o Power BI. Falhou âncora → exit 1 (o snapshot não está pronto). */
import { agregar, ateCorte, filtrar, share, total } from "../src/calc";
import { linhasIbge } from "../src/fontes";
import type { Linha, TabelaFio } from "../src/types";

const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ler = async (n: string): Promise<Linha[]> => {
  const t = (await Bun.file(`${AQUI}../dados/${n}.json`).json()) as TabelaFio;
  return t.r.map((r) => Object.fromEntries(t.c.map((c, i) => [c, r[i] ?? null])));
};

const basf24 = filtrar(await ler("basf"), { ano: ["2024"] });
const resumo = await ler("resumo");
const ibge = linhasIbge(filtrar(await ler("ibge"), { ano: ["2024"] }), "total", {});
const kcl = await ler("clientes");
const vendas = await ler("vendas");
const abcsem = await ler("abcsem");
const cepea = await ler("cepea");
const v26 = vendas.filter((v) => v.ano === 2026 && (v.mes as number) <= 6);

const somaPor = (ls: Linha[], dim: string) => agregar(ls, {}, dim, "valor").reduce((a, g) => a + g.valor, 0);

const ancoras: [string, number | null, number, number][] = [
  ["BASF 2024 área semeio", total(basf24, "area"), 111587, 1],
  ["BASF 2024 Total TH", total(basf24, "th"), 34348416, 1],
  ["BASF 2024 potencial R$", total(basf24, "potencial"), 342609894, 1000],
  ["ABCSEM 2024 área (resumo)", total(filtrar(resumo, { fonte: ["ABCSEM"], ano: ["2024"] }), "area"), 397125, 1],
  ["IBGE 2024 área BR", total(ibge, "area"), 232102, 1],
  ["Key list share copa", share(total(kcl, "copa"), total(kcl, "mercado")), 0.18949, 0.0005],
  // Regra do PBI Sales (SBB+SDB, TH = inv_qty): bate centavo a centavo com o forecast.pbix.
  ["Vendas 2024 R$ (PBI)", total(vendas.filter((v) => v.ano === 2024), "valor"), 62619923.49, 1],
  ["Vendas 2025 R$ (PBI)", total(vendas.filter((v) => v.ano === 2025), "valor"), 82552396.54, 1],
  ["Vendas YTD jan-jun 2026 R$ (PBI)", total(v26, "valor"), 28989184.33, 1],
  ["Vendas YTD 2026 TH (PBI 56 mil)", total(v26, "th"), 56485, 1],
  ["Vendas 2025 até 26/jun (PBI: var −23,98%)", total(vendas.filter((v) => v.ano === 2025 && ateCorte(v, 6, 26)), "valor"), 38134199.88, 1],
  ["Σ por RTV = total jan-jun 2026", somaPor(v26, "rtv"), 28989184.33, 1],
  ["Σ por variedade = total jan-jun 2026", somaPor(v26, "variedade"), 28989184.33, 1],
  ["ABCSEM segmento Híbrido, volume todos os anos", total(filtrar(abcsem, { segmento: ["Híbrido"] }), "volume"), 479071966, 1],
  ["BASF 2020 área no Comparativo (semeio direto)", total(filtrar(resumo, { fonte: ["BASF"], ano: ["2020"] }), "area"), 122060, 1],
  ["CEPEA 2024 Área Cepea em ha (Estimativa agosto/24)", total(filtrar(cepea, { item: ["Área Cepea"], ano: ["2024"] }), "area"), 497336, 1],
];

let falhou = false;
for (const [nome, obtido, esperado, tol] of ancoras) {
  const ok = obtido != null && Math.abs(obtido - esperado) <= tol;
  falhou ||= !ok;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}: ${obtido} (esperado ${esperado})`);
}

// Informativo, não bloqueia: o share potencial do PBI Mercado (17,9%) usa vendas por data de pedido,
// só moeda "Real", de uma cópia de vendas congelada no .pbix.
const potencial = total(basf24, "potencial");
const vendas24 = total(vendas.filter((v) => v.ano === 2024), "valor");
console.log(`info  share potencial 2024 com as regras do snapshot: ${((share(vendas24, potencial) ?? 0) * 100).toFixed(1)}% (PBI: 17,9%)`);

if (falhou) process.exit(1);
