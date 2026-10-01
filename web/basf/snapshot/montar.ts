/**
 * _bruto/*.json → dados/<recurso>.json no formato TabelaFio, + dados/pendencias.json.
 * Toda regra de limpeza vem de normaliza.ts (testado). Aqui é só encanamento.
 */
import type { Linha, TabelaFio, Valor } from "../src/types";
import {
  casarMunicipio, dividirUF, indiceMunicipios, limparCepea, limparHotspot, normalizarCrop, regiaoDasUfs, ufDoCodigo, ufsDoEstado,
} from "./normaliza";

const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const BRUTO = `${AQUI}../dados/_bruto/`;
const SAIDA = `${AQUI}../dados/`;
type Bruto = Record<string, any>;
const ler = async (n: string): Promise<Bruto[]> => Bun.file(`${BRUTO}${n}.json`).json();
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (v == null || String(v).trim() === "" ? null : String(v).trim());

const pendencias: Record<string, string[]> = {};
const pendente = (tipo: string, v: string) => { (pendencias[tipo] ??= []).includes(v) || pendencias[tipo]!.push(v); };

async function gravar(nome: string, linhas: Linha[]) {
  const c = Object.keys(linhas[0] ?? {});
  const fio: TabelaFio = { c, r: linhas.map((l) => c.map((k) => l[k] as Valor)) };
  await Bun.write(`${SAIDA}${nome}.json`, JSON.stringify(fio));
  console.log(`${nome}: ${linhas.length}`);
}

// municípios: uf derivada do código
const munBruto = await ler("municipios");
const municipios = munBruto.map((m) => ({ cod: m.cod as number, nome: String(m.nome), uf: ufDoCodigo(m.cod)!, lat: num(m.lat), lon: num(m.lon) }));
const idx = indiceMunicipios(municipios);
await gravar("municipios", municipios);

// BASF consolidado
await gravar("basf", (await ler("basf")).map((b) => {
  const ufs = dividirUF(b.uf);
  const municipio = txt(b.municipio);
  const cod = casarMunicipio(municipio, ufs, idx);
  if (municipio && cod == null) pendente("municipio_sem_codigo", `${municipio} (${b.uf ?? "sem UF"})`);
  return {
    ano: num(b.ano), uf: ufs.length === 1 ? ufs[0]! : (cod != null ? ufDoCodigo(cod) : txt(b.uf)),
    cod, municipio, hotspot: limparHotspot(b.hotspot), regional: txt(b.regional), rtv: txt(b.rtv),
    crop: txt(b.crop), cropDesc: txt(b.cropDesc), segmento: txt(b.segmento), hy: txt(b.hy),
    area: num(b.area), dose: num(b.dose), th: num(b.th), potencial: num(b.potencial), potencialEur: num(b.potencialEur),
  };
}));

// IBGE: meso só faz sentido no nível ME; cod de MU vira uf pelo código
await gravar("ibge", (await ler("ibge")).map((i) => ({
  nivel: i.nivel, ano: num(i.ano), especie: txt(i.especie),
  uf: txt(i.uf) ?? (i.nivel === "MU" ? ufDoCodigo(i.cod) : null),
  meso: i.nivel === "ME" ? txt(i.nome) : null,
  cod: i.nivel === "MU" ? num(i.cod) : null, nome: txt(i.nome), area: num(i.area),
})));

await gravar("abcsem", (await ler("abcsem")).map((a) => ({
  ano: num(a.ano), especie: txt(a.especie), tipo: txt(a.tipo), segmento: txt(a.segmento), crop: txt(a.crop),
  selecionado: a.selecionado ? 1 : 0, area: num(a.area), volume: num(a.volume), valor: num(a.valor),
})));

await gravar("cepea", limparCepea(await ler("cepea")).map((c) => {
  const ufs = ufsDoEstado(c.estado);
  const regiao = regiaoDasUfs(ufs) ?? txt(c.regiao);
  if (regiao !== txt(c.regiao)) pendente("cepea_regiao_corrigida", `${c.estado}: ${c.regiao} → ${regiao}`);
  return {
    ano: num(c.ano), safra: txt(c.safra), regiao, uf: ufs.length === 1 ? ufs[0]! : null,
    estado: txt(c.estado), regional: txt(c.regional), produto: txt(c.produto), item: txt(c.item), area: num(c.valor),
  };
}));

await gravar("resumo", (await ler("resumo")).map((r) => ({
  fonte: r.fonte, ano: num(r.ano), especie: txt(r.especie), area: num(r.area), th: num(r.th),
})));
await gravar("resumoSeg", (await ler("resumoSeg")).map((r) => ({
  fonte: r.fonte, ano: num(r.ano), especie: txt(r.especie), segmento: txt(r.segmento), hy: txt(r.hy),
  crop: txt(r.crop), area: num(r.area), th: num(r.th),
})));

await gravar("clientes", (await ler("clientes")).map((k) => ({
  cliente: txt(k.cliente), crop: txt(k.crop), hotspot: limparHotspot(k.hotspot), rtv: txt(k.rtv),
  regional: txt(k.regional), acesso: txt(k.acesso), ano: num(k.ano), area: num(k.area), dose: num(k.dose),
  mercado: num(k.mercado), copa: num(k.copa), enxertia: num(k.enxertia), vendasEnx: num(k.vendasEnx),
  mercadoCopaEnx: num(k.mercadoCopaEnx), potencial: num(k.potencial), vendasPotencial: num(k.vendasPotencial),
})));

// Vendas: enriquecidas com os mesmos de-paras do PBI
const hotspotPor = new Map((await ler("depara_cliente_hotspot")).map((d) => [`${d.custNo}|${d.crop}`, limparHotspot(d.hotspot)]));
const seg2 = new Map((await ler("depara_item_segmento")).map((d) => [String(d.item), String(d.segmentoII)]));
const segFinal = new Map((await ler("depara_segmento")).map((d) => [String(d.segmentoII), String(d.segmento)]));
const regionalPor = new Map((await ler("sales_specialist")).map((s) => [String(s.cod), txt(s.regional)]));
const vendasBruto = (await Bun.file(`${BRUTO}vendas.json`).json()) as { ultimaVenda: string; linhas: Bruto[] };

const vendas = new Map<string, Linha>();
for (const v of vendasBruto.linhas) {
  const crop = normalizarCrop(v.kind);
  const s2 = seg2.get(String(v.item));
  const l: Linha = {
    ano: v.ano, mes: v.mes, crop, rtv: txt(v.rtvNome) ?? txt(v.rtvCod) ?? "Sem RTV",
    regional: regionalPor.get(String(v.rtvCod)) ?? "Sem regional", cliente: txt(v.cliente),
    hotspot: hotspotPor.get(`${v.custNo}|${crop}`) ?? null,
    segmento: s2 ? segFinal.get(s2) ?? s2 : null, valor: 0, th: 0,
  };
  const k = [l.ano, l.mes, l.crop, l.rtv, l.regional, l.cliente, l.hotspot, l.segmento].join("|");
  const acc = vendas.get(k) ?? vendas.set(k, l).get(k)!;
  acc.valor = (acc.valor as number) + (num(v.valor) ?? 0);
  acc.th = (acc.th as number) + (num(v.th) ?? 0);
}
await gravar("vendas", [...vendas.values()]);

const meta = (await Bun.file(`${AQUI}meta_anual.json`).json()) as Linha[];
const maior = Math.max(...meta.map((m) => m.ano as number));
await gravar("meta", meta.map((m) => ({ ...m, ultimaVenda: m.ano === maior ? vendasBruto.ultimaVenda : null })));

await Bun.write(`${SAIDA}pendencias.json`, JSON.stringify(pendencias, null, 2));
console.log("pendências:", Object.fromEntries(Object.entries(pendencias).map(([k, v]) => [k, v.length])));
