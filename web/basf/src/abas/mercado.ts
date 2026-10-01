import * as Plot from "@observablehq/plot";
import { agregar, filtrar, share, total, variacao, type Filtros } from "../calc";
import { barList, cartao, distribuicao, kpi, seg, type Kpi } from "../componentes";
import { alternarFiltro } from "../estado";
import { FONTES, ITENS_CEPEA, linhasIbge, ROTULO_DIM } from "../fontes";
import { desenharMapa, type PontoMapa } from "../mapa";
import { estadoVazio } from "../shared/blocos";
import { criarDrill } from "../shared/drill";
import { esc, moedaCompacta, n0, nf } from "../shared/formato";
import { C, ESCALA } from "../shared/tema";
import type { Linha } from "../types";
import type { Ctx, DefAba } from "./tipos";

const UNIDADE: Record<string, string> = { area: "ha", dose: "TH/ha", th: "TH", volume: "", valor: "" };
const fmtMetrica = (m: string) => (v: number) =>
  m === "valor" ? (Math.abs(v) >= 1e6 ? moedaCompacta(v) : `R$ ${n0(Math.round(v))}`) : m === "dose" ? `${nf(v, 0)} ${UNIDADE[m]}` : `${n0(Math.round(v))}${UNIDADE[m] ? ` ${UNIDADE[m]}` : ""}`;
const DIMS_VENDAS = ["ano", "crop", "rtv", "regional", "hotspot", "segmento"];
const pct = (v: number | null) => (v == null ? "—" : `${nf(v * 100, 1)}%`);
const deltaTxt = (v: number | null, base: string) => (v == null ? null : { txt: `${v >= 0 ? "+" : "−"}${nf(Math.abs(v) * 100, 1)}% vs ${base}`, ruim: v < 0 });

/** Linhas da fonte ativa já no nível certo (IBGE) para a visão pedida. */
function base(ctx: Ctx, visao: "total" | "uf" | "meso" | "mapa"): Linha[] {
  const ls = ctx.dados[ctx.estado.fonte] ?? [];
  if (ctx.estado.fonte === "cepea") return ls.filter((l) => l.item === ctx.estado.itemCepea);
  if (ctx.estado.fonte !== "ibge") return ls;
  return linhasIbge(ls, visao, ctx.estado.filtros.mercado);
}

/** Anos com dado, crescente. Filtro de ano escolhe o "atual"; sem filtro, o último. */
function anos(ls: Linha[]): number[] {
  return [...new Set(ls.map((l) => l.ano).filter((a): a is number => typeof a === "number"))].sort((a, b) => a - b);
}

export const mercado: DefAba = {
  id: "mercado",
  rotulo: "Mercado",
  recursos: (e) => (e.fonte === "basf" ? ["basf", "vendas", "municipios", "meta"] : e.fonte === "ibge" ? ["ibge", "municipios"] : [e.fonte]),
  chips: (e) => ({ dims: FONTES[e.fonte].dims, origem: e.fonte }),
  controles: (e) =>
    seg("fonte", { basf: "BASF", ibge: "IBGE", abcsem: "ABCSEM", cepea: "CEPEA" }, e.fonte) +
    (Object.keys(FONTES[e.fonte].metricas).length > 1 ? seg("metrica", FONTES[e.fonte].metricas, e.metrica) : "") +
    (e.fonte === "cepea" ? seg("itemCepea", ITENS_CEPEA, e.itemCepea) : ""),

  render(ctx, corpo) {
    const { estado: e } = ctx;
    const f: Filtros = e.filtros.mercado;
    const m = e.metrica;
    const fmt = fmtMetrica(m);
    const semAno: Filtros = { ...f, ano: [] };
    const todosAnos = anos(base(ctx, "total"));
    const anoAtual = f.ano?.length ? Math.max(...f.ano.map(Number)) : todosAnos.at(-1);
    const anoAnt = todosAnos.filter((a) => anoAtual != null && a < anoAtual).at(-1);
    const fAtual: Filtros = { ...f, ano: anoAtual != null ? [String(anoAtual)] : [] };
    const fAnt: Filtros = { ...f, ano: anoAnt != null ? [String(anoAnt)] : [] };
    const tot = (ff: Filtros, met = m) => total(filtrar(base(ctx, "total"), ff), met);
    const serieDe = (v: (ano: number) => number | null) => {
      // Série contínua de anos: ano sem estudo vira null e quebra a sparkline.
      const lo = todosAnos[0], hi = todosAnos.at(-1);
      if (lo == null || hi == null) return [];
      return Array.from({ length: hi - lo + 1 }, (_, i) => v(lo + i));
    };
    const serie = (met = m) => serieDe((a) => tot({ ...semAno, ano: [String(a)] }, met));

    if (tot(fAtual) == null) {
      corpo.innerHTML = `<div class="bmd-card">${estadoVazio("Sem dado neste recorte", `Nenhum registro de <b>${FONTES[e.fonte].rotulo}</b> para os filtros escolhidos. Remova um filtro na barra acima.`)}</div>`;
      return;
    }

    const kpis: Kpi[] = [];
    const baseAnt = anoAnt != null ? String(anoAnt) : "ano anterior";
    const def = FONTES[e.fonte];
    if (e.fonte === "basf") {
      // Share: venda do ano civil do estudo ÷ potencial, mesmos filtros. Estado não existe em vendas.
      const vendasDe = (ff: Filtros) => f.uf?.length ? null
        : total(filtrar(ctx.dados.vendas ?? [], Object.fromEntries(Object.entries(ff).filter(([k]) => DIMS_VENDAS.includes(k)))), "valor");
      const shareDe = (ff: Filtros) => share(vendasDe(ff), tot(ff, "potencial"));
      const vendasAno = vendasDe(fAtual), pot = tot(fAtual, "potencial");
      const sh = share(vendasAno, pot), shAnt = anoAnt != null ? shareDe(fAnt) : null;
      kpis.push({
        rotulo: "Share potencial", valor: pct(sh), destaque: true, proporcao: sh,
        delta: sh != null && shAnt != null ? { txt: `${sh >= shAnt ? "+" : "−"}${nf(Math.abs(sh - shAnt) * 100, 1)} p.p. vs ${baseAnt}`, ruim: sh < shAnt } : null,
        nota: f.uf?.length ? "share não se aplica a filtro de estado" : `vendas ${moedaCompacta(vendasAno)} de ${moedaCompacta(pot)}`,
        serie: serieDe((a) => shareDe({ ...semAno, ano: [String(a)] })),
      });
    }
    for (const met of e.fonte === "basf" ? ["area", "th"] : Object.keys(def.metricas).slice(0, 3)) {
      const atual = tot(fAtual, met), rot = def.metricas[met]!;
      // A página ABCSEM do PBI soma todas as espécies; o Comparativo usa só as da BASF (produtos_selecionados).
      const daBasf = e.fonte === "abcsem" && met === "area" ? tot({ ...fAtual, selecionado: ["1"] }, met) : null;
      kpis.push({
        rotulo: daBasf != null ? `${rot} · mercado total` : rot, valor: atual == null ? "—" : fmtMetrica(met)(atual),
        delta: deltaTxt(variacao(atual, tot(fAnt, met)), baseAnt), serie: serie(met),
        nota: daBasf != null ? `espécies BASF: ${fmtMetrica(met)(daBasf)}` : undefined,
      });
    }
    if (e.fonte === "basf") {
      const pot = tot(fAtual, "potencial");
      kpis.push({
        rotulo: "Potencial", valor: moedaCompacta(pot), delta: deltaTxt(variacao(pot, tot(fAnt, "potencial")), baseAnt),
        nota: `€ ${nf((tot(fAtual, "potencialEur") ?? 0) / 1e6, 1)} Mi`, serie: serie("potencial"),
      });
    }

    // Drill estado → hotspots só na BASF (as outras fontes não têm hotspot). O caminho mora no estado.
    const podeDrill = e.fonte === "basf" && e.dim === "uf";
    let pronto = false;
    const drill = criarDrill<string>(["Estado", "Hotspot"], () => { if (pronto) ctx.mudar((s) => ({ ...s, drill: drill.chaves() })); });
    if (podeDrill) e.drill.forEach((k) => drill.descer(k));
    pronto = true;
    const ufDrill = drill.chave();
    const dimRank = ufDrill != null ? "hotspot" : e.dim;
    const visaoRank = e.fonte === "ibge" ? (e.dim === "meso" ? "meso" : "uf") : "total";
    const ranking = agregar(base(ctx, visaoRank), ufDrill != null ? { ...fAtual, uf: [ufDrill] } : fAtual, dimRank, m);
    const tituloRank = ufDrill != null ? drill.titulo() : `Por ${ROTULO_DIM[e.dim]?.toLowerCase() ?? e.dim}`;
    const subRank = podeDrill && ufDrill == null ? `${esc(def.metricas[m] ?? m)} · clique num estado para ver os hotspots` : esc(def.metricas[m] ?? m);
    const dimSeg = e.fonte === "basf" ? "segmento" : e.fonte === "abcsem" ? "segmento" : e.fonte === "cepea" ? "produto" : "especie";
    const comp = agregar(base(ctx, "total"), fAtual, dimSeg, m);

    corpo.innerHTML = `
      <div class="bmd-kpis2">${kpis.map(kpi).join("")}</div>
      <div class="bmd-grid2">
        ${def.temMapa ? cartao("Distribuição geográfica", "clique num estado para filtrar", '<div data-el="mapa"></div>') : ""}
        <div class="bmd-pilha">
          ${cartao(tituloRank, subRank,
            barList(ranking, dimRank, fmt, f[dimRank] ?? [], 8, podeDrill && ufDrill == null ? "drill" : "filtro") || '<p class="bmd-nota">Sem dado neste recorte.</p>',
            `<div style="margin-bottom:8px">${seg("dim", Object.fromEntries(def.rankings.map((d) => [d, ROTULO_DIM[d] ?? d])), e.dim)}${drill.htmlVoltar()}</div>`)}
          ${comp.length > 1 ? cartao(`Composição por ${ROTULO_DIM[dimSeg]?.toLowerCase() ?? dimSeg}`, "", distribuicao(comp, dimSeg, ESCALA)) : ""}
        </div>
      </div>
      ${cartao("Evolução por ano", esc(def.metricas[m] ?? m), '<div data-el="anos"></div>', "")}`;

    corpo.querySelectorAll<HTMLElement>("[data-drill]").forEach((b) => b.addEventListener("click", () => drill.descer(b.dataset.v!)));
    corpo.querySelector("[data-el-voltar]")?.addEventListener("click", () => drill.voltar());

    if (def.temMapa) {
      const porUf = new Map(agregar(base(ctx, e.fonte === "ibge" ? "uf" : "total"), fAtual, "uf", m).map((g) => [g.chave, g.valor]));
      const munis = new Map((ctx.dados.municipios ?? []).map((x) => [x.cod as number, x]));
      const pontos: PontoMapa[] = e.fonte === "cepea" ? [] : agregar(base(ctx, "mapa"), fAtual, "cod", m).flatMap((g) => {
        const mu = munis.get(Number(g.chave));
        return mu && mu.lat != null && mu.lon != null ? [{ lat: mu.lat as number, lon: mu.lon as number, valor: g.valor, rotulo: String(mu.nome) }] : [];
      });
      desenharMapa(ctx.shell, "mapa", porUf, pontos, fmt, (uf) => ctx.mudar((s) => alternarFiltro(s, "uf", uf)), f.uf ?? []);
    }

    const pontosAno = todosAnos.map((a) => ({ ano: a, v: tot({ ...semAno, ano: [String(a)] }) }));
    const lo = todosAnos[0]!, hi = todosAnos.at(-1)!;
    const dominio = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const passo = Math.ceil(dominio.length / Math.max(1, Math.floor((ctx.shell.largura() - 100) / 40)));
    ctx.shell.desenhar("anos", {
      height: 200, marginLeft: 100,
      x: { type: "band", domain: dominio, ticks: dominio.filter((_, i) => i % passo === 0), label: null, tickFormat: (v: number) => String(v) },
      y: { grid: true, label: null, tickFormat: (v: number) => fmt(v) },
      marks: [
        Plot.barY(pontosAno.filter((p) => p.v != null), { x: "ano", y: "v", fill: (p: { ano: number }) => (p.ano === anoAtual ? C.o500 : C.o200), rx: 3, title: (p: { ano: number; v: number }) => `${p.ano}: ${fmt(p.v)}` }),
        Plot.ruleY([0]),
      ],
    });
  },
};
