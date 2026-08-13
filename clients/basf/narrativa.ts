/**
 * Texto que muda de sentido conforme os dados.
 *
 * Tudo que é afirmação — "caiu", "pior ano da série", "todas as culturas
 * perderam volume" — mora aqui e é derivado dos números. Prosa neutra
 * (definições, metodologia, descrição de eixo) fica em `pages.ts`.
 *
 * Regra ao editar: se a frase deixaria de ser verdade com outro conjunto de
 * dados, ela pertence a este arquivo.
 */
import type { Dados } from "./queries";
import { mi, pct, sinal } from "../../core/report";

// ── vocabulário direcional ────────────────────────────────────────────────
export const verbo = (n: number) => (n < 0 ? "caiu" : n > 0 ? "subiu" : "ficou estável");
export const subst = (n: number) => (n < 0 ? "queda" : "alta");

/** "a e b" / "a, b e c" */
export function lista(xs: string[]): string {
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0]!;
  return xs.slice(0, -1).join(", ") + " e " + xs.at(-1);
}

const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

// ── capa ──────────────────────────────────────────────────────────────────
/** Manchete em 3 linhas. Muda de tese conforme a magnitude e o sinal. */
export function manchete(varFat: number): string {
  if (varFat <= -40) return "A receita caiu pela<br>metade. Este relatório<br>mostra exatamente onde.";
  if (varFat <= -10) return `A receita recuou ${pct(Math.abs(varFat), 0)}.<br>Este relatório mostra<br>exatamente onde.`;
  if (varFat < 10) return "A receita ficou estável.<br>O que mudou está<br>embaixo do agregado.";
  return `A receita cresceu ${pct(varFat, 0)}.<br>Este relatório mostra<br>de onde veio.`;
}

export function resumo(fat26: number, fat25: number, varFat: number): string {
  const delta = Math.abs(fat26 - fat25);
  const s = subst(varFat);
  return `O primeiro semestre de 2026 fechou em <strong>R$ ${mi(fat26)} milhões</strong>, contra
    R$ ${mi(fat25)} milhões no mesmo período de 2025. A ${s} de
    <strong>R$ ${mi(delta)} milhões</strong> não é difusa: quatro movimentos identificáveis
    respondem por toda ela, e três deles têm nome e sobrenome.`;
}

// ── página 2: waterfall ───────────────────────────────────────────────────
export function tituloBridge(varFat: number, delta: number): string {
  return varFat < 0 ? `Onde foram os R$ ${mi(delta)} milhões` : `De onde vieram os R$ ${mi(delta)} milhões`;
}

// ── página 3: receita x volume ────────────────────────────────────────────
export function tituloMix(varFat: number, varVol: number): string {
  if (varFat < 0 && varVol < varFat) return "Receita cai, volume despenca";
  if (varFat > 0 && varVol < 0) return "Receita sobe, volume cai";
  if (varFat < 0 && varVol > 0) return "Volume cresce, receita não acompanha";
  return "Receita e volume na mesma direção";
}

/** O preço médio subiu ou caiu, e o que isso diz sobre o mix. */
export function textoMix(p25: number, p26: number, varVol: number): string {
  const varPreco = ((p26 - p25) / p25) * 100;
  if (varPreco > 5 && varVol < 0) {
    return `Isso <em>não</em> é reajuste: é mudança de mix. Deixou-se de vender o produto barato
      em escala e a cesta ficou concentrada em sementes caras. Receita preservada no curto prazo,
      base de clientes erodida no longo.`;
  }
  if (varPreco < -5) {
    return `O preço médio ${verbo(varPreco)} ${pct(Math.abs(varPreco), 0)}. Diferente de perda de
      volume, isso pressiona margem diretamente — e não se recupera com esforço comercial.`;
  }
  return `O preço médio ficou praticamente estável (${sinal(varPreco, 1)}), então a variação de
    receita reflete volume, não mix nem tabela.`;
}

// ── página 4: culturas ────────────────────────────────────────────────────
export type VarCultura = { cultura: string; dPreco: number; dVol: number; fat: number };

/** Gera os parágrafos do card de culturas a partir dos quadrantes ocupados. */
export function leiturasCultura(cs: VarCultura[]): string {
  const total = cs.length;
  const perdeuVol = cs.filter((c) => c.dVol < 0);
  const ganhouVol = cs.filter((c) => c.dVol >= 0);
  // ±2% é ruído de arredondamento em preço médio ponderado.
  const segurouPreco = perdeuVol.filter((c) => c.dPreco >= -2);
  const cedeuAmbos = perdeuVol.filter((c) => c.dPreco < -2);
  const nome = (c: VarCultura) => c.cultura;
  const p: string[] = [];

  if (perdeuVol.length === total) {
    p.push(`<strong>Todas as ${total === 5 ? "cinco" : total} culturas perderam volume.</strong>
      Nenhuma está no quadrante superior — não há uma cultura compensando as outras.`);
  } else if (perdeuVol.length === 0) {
    p.push(`<strong>Todas as culturas ganharam volume.</strong> O crescimento é generalizado,
      não puxado por um único produto.`);
  } else {
    p.push(`<strong>${perdeuVol.length} de ${total} culturas perderam volume</strong>, contra
      ${ganhouVol.length} em crescimento (${lista(ganhouVol.map(nome))}).`);
  }

  if (segurouPreco.length) {
    p.push(`${lista(segurouPreco.map(nome))} ${plural(segurouPreco.length, "segurou", "seguraram")}
      o preço enquanto o volume caía: perda de participação, não de posicionamento. Recuperar
      volume aqui é questão comercial, não de tabela.`);
  }
  if (cedeuAmbos.length) {
    p.push(`${lista(cedeuAmbos.map(nome))} ${plural(cedeuAmbos.length, "cedeu", "cederam")} preço
      <em>e</em> volume — a combinação que indica pressão competitiva real. É onde o preço já não
      está defendendo participação.`);
  }
  return p.map((t) => `<p class="small muted">${t}</p>`).join("\n");
}

// ── página 5: aquisição ───────────────────────────────────────────────────
export function tituloAquisicao(novosFat: number, perdidosFat: number): string {
  const cobertura = novosFat / Math.abs(perdidosFat);
  if (cobertura < 0.3) return "O motor de aquisição parou";
  if (cobertura < 1) return "A aquisição não cobre a saída";
  return "A aquisição está repondo a base";
}

export function textoAquisicao(novosFat: number, perdidosFat: number): string {
  const c = novosFat / Math.abs(perdidosFat);
  if (c >= 1) return `A entrada de novos clientes cobre o que saiu — a base se renova sem depender de recuperação.`;
  const fracao = c < 0.2 ? "nem um quinto" : c < 0.35 ? "nem um terço" : c < 0.55 ? "metade" : "dois terços";
  return `A reposição não cobre ${fracao} do que saiu — o resultado depende inteiramente de
    defender a base atual.`;
}

// ── página 9: devoluções ──────────────────────────────────────────────────
export function legendaDevolucoes(serie: { ano: number; perc: number }[]): string {
  const atual = serie.at(-1)!;
  const pior = serie.reduce((m, r) => (r.perc > m.perc ? r : m));
  if (pior.ano === atual.ano) return `${atual.ano} é o pior ano da série.`;
  const media = serie.reduce((s, r) => s + r.perc, 0) / serie.length;
  const onde = atual.perc > media ? "acima" : "abaixo";
  return `${atual.ano} está ${onde} da média da série (${pct(media)}); o pior foi ${pior.ano}, com ${pct(pior.perc)}.`;
}

// ── página 10: plano de ação ──────────────────────────────────────────────
/** "Elevar cobertura de X para meta" só faz sentido se X ainda estiver abaixo da meta. */
export function metaCobertura(atualPct: number, metaPct: number): string {
  if (atualPct >= metaPct) {
    return `Manter cobertura contratual acima de ${pct(metaPct, 0)}, hoje em ${pct(atualPct, 0)}.`;
  }
  return `Elevar cobertura contratual de ${pct(atualPct, 0)} para ${pct(metaPct, 0)}.`;
}

/** Alta prioridade = tem estimativa de R$ calculável no horizonte descrito; senão é enabler. */
export const prioridadeAcao = (valorCalculavel: boolean): "Alta" | "Média" => (valorCalculavel ? "Alta" : "Média");

// ── composição ────────────────────────────────────────────────────────────
export function narrar(d: Dados, v: VarCultura[]) {
  const a = d.kpis.find((k) => k.ano === 2025)!;
  const b = d.kpis.find((k) => k.ano === 2026)!;
  const varFat = ((b.fat - a.fat) / Math.abs(a.fat)) * 100;
  const varVol = ((b.vol - a.vol) / Math.abs(a.vol)) * 100;
  const br25 = d.precoVolume.find((r) => r.mercado === "Brasil" && r.ano === 2025)!;
  const br26 = d.precoVolume.find((r) => r.mercado === "Brasil" && r.ano === 2026)!;
  const novos = d.coorte.find((c) => c.status === "Novo")!;
  const perdidos = d.coorte.find((c) => c.status === "Perdido")!;

  return {
    varFat,
    varVol,
    delta: Math.abs(b.fat - a.fat),
    manchete: manchete(varFat),
    resumo: resumo(b.fat, a.fat, varFat),
    tituloBridge: tituloBridge(varFat, Math.abs(b.fat - a.fat)),
    tituloMix: tituloMix(varPctBr(br25.fat, br26.fat), varPctBr(br25.vol, br26.vol)),
    textoMix: textoMix(br25.fat / br25.vol, br26.fat / br26.vol, varPctBr(br25.vol, br26.vol)),
    leiturasCultura: leiturasCultura(v),
    tituloAquisicao: tituloAquisicao(novos.fat, perdidos.fat),
    textoAquisicao: textoAquisicao(novos.fat, perdidos.fat),
    legendaDevolucoes: legendaDevolucoes(d.devolucoes),
  };
}

const varPctBr = (x: number, y: number) => ((y - x) / Math.abs(x)) * 100;
