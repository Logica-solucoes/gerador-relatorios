import * as Plot from "@observablehq/plot";
import ufGeo from "./geo/uf.json";
import { ligarClique } from "./shared/drill";
import type { Shell } from "./shared/shell";
import { C } from "./shared/tema";

export interface PontoMapa { lat: number; lon: number; valor: number; rotulo: string }

/** Afastamento mínimo (px) entre rótulos: o texto tem ~120px de largura e 14 de altura. */
const DIST_ROTULO_PX = 90;

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const coords = (g: unknown): [number, number][] => (Array.isArray(g) && typeof g[0] === "number" ? [g as [number, number]] : (g as unknown[]).flatMap(coords));

/** Pixels por unidade mercator: o Plot encaixa o domínio (UFs) em largura x altura mantendo a proporção. */
function escalaPx(largura: number, alto: number): number {
  const pts = (ufGeo as unknown as { features: { geometry: { coordinates: unknown } }[] }).features.flatMap((f) => coords(f.geometry.coordinates));
  const xs = pts.map((c) => (c[0] * Math.PI) / 180), ys = pts.map((c) => merc(c[1]));
  return Math.min((largura - 8) / (Math.max(...xs) - Math.min(...xs)), (alto - 8) / (Math.max(...ys) - Math.min(...ys)));
}

function rotulaveis(pontos: PontoMapa[], n: number, px: number): PontoMapa[] {
  const escolhidos: PontoMapa[] = [];
  const dist = (p: PontoMapa, q: PontoMapa) => px * Math.hypot(((p.lon - q.lon) * Math.PI) / 180, merc(p.lat) - merc(q.lat));
  for (const p of [...pontos].sort((a, b) => b.valor - a.valor)) {
    if (escolhidos.every((q) => dist(p, q) > DIST_ROTULO_PX)) escolhidos.push(p);
    if (escolhidos.length === n) break;
  }
  return escolhidos;
}

/**
 * Estados pintados pela métrica; pontos por município; 5 maiores rotulados.
 * Clique num estado chama `aoClicarUf(sigla)`.
 */
export function desenharMapa(
  shell: Shell, alvo: string, porUf: Map<string, number>, pontos: PontoMapa[],
  fmt: (v: number) => string, aoClicarUf: (uf: string) => void, ufsAtivas: string[],
): void {
  const geo = ufGeo as unknown as { features: { properties: { uf: string } }[] };
  const alto = Math.min(460, Math.max(300, shell.largura() * 0.45));
  shell.desenhar(alvo, {
    height: alto,
    margin: 4,
    projection: { type: "mercator", domain: ufGeo as never },
    color: { type: "sqrt", range: [C.o100, C.o500], unknown: "#F6EFE4" },
    r: { range: [2, 15] },
    marks: [
      Plot.geo(geo as never, {
        fill: (f: { properties: { uf: string } }) => porUf.get(f.properties.uf),
        stroke: (f: { properties: { uf: string } }) => (ufsAtivas.includes(f.properties.uf) ? C.o700 : "#fff"),
        strokeWidth: (f: { properties: { uf: string } }) => (ufsAtivas.includes(f.properties.uf) ? 2 : 1),
        title: (f: { properties: { uf: string } }) => `${f.properties.uf}: ${porUf.has(f.properties.uf) ? fmt(porUf.get(f.properties.uf)!) : "sem dado"}`,
      }),
      Plot.geo(geo as never, Plot.pointer(Plot.centroid({ stroke: C.o700, strokeWidth: 2, fill: "none" }))),
      Plot.dot(pontos, { x: "lon", y: "lat", r: "valor", fill: C.verde, fillOpacity: 0.55, stroke: "#2F5E14", strokeWidth: 0.8, title: (p: PontoMapa) => `${p.rotulo}: ${fmt(p.valor)}` }),
      Plot.text(rotulaveis(pontos, 5, escalaPx(shell.largura(), alto)), {
        x: "lon", y: "lat", text: (p: PontoMapa) => `${p.rotulo}  ${fmt(p.valor)}`,
        dx: 12, textAnchor: "start", fontSize: 11, fontWeight: 600, fill: C.ink, stroke: "#fff", strokeWidth: 3,
      }),
    ],
  });
  const svg = shell.svg(alvo);
  if (svg) ligarClique<{ properties: { uf: string } }>(svg, (f) => aoClicarUf(f.properties.uf));
}
