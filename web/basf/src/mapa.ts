import * as Plot from "@observablehq/plot";
import ufGeo from "./geo/uf.json";
import type { Shell } from "./shared/shell";
import { C } from "./shared/tema";

export interface PontoMapa { lat: number; lon: number; valor: number; rotulo: string }

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const rad = (lon: number) => (lon * Math.PI) / 180;
const coords = (g: unknown): [number, number][] => (Array.isArray(g) && typeof g[0] === "number" ? [g as [number, number]] : (g as unknown[]).flatMap(coords));

/** O Plot encaixa o domínio (UFs) em largura x altura mantendo a proporção e centraliza: devolve px por unidade mercator e o centro. */
function projecao(largura: number, alto: number) {
  const pts = (ufGeo as unknown as { features: { geometry: { coordinates: unknown } }[] }).features.flatMap((f) => coords(f.geometry.coordinates));
  const xs = pts.map((c) => rad(c[0])), ys = pts.map((c) => merc(c[1]));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((largura - 8) / (x1 - x0), (alto - 8) / (y1 - y0));
  return (p: PontoMapa) => ({ x: largura / 2 + k * (rad(p.lon) - (x0 + x1) / 2), y: alto / 2 - k * (merc(p.lat) - (y0 + y1) / 2) });
}

const CHAR_PX = 6.6;

/** Maiores pontos com rótulo que cabe no mapa: à direita do ponto, ou à esquerda perto da borda; sem sobrepor outro rótulo. */
function rotulaveis(pontos: PontoMapa[], n: number, largura: number, alto: number, texto: (p: PontoMapa) => string) {
  const pos = projecao(largura, alto);
  const caixas: [number, number, number, number][] = [];
  const dir: PontoMapa[] = [], esq: PontoMapa[] = [];
  for (const p of [...pontos].sort((a, b) => b.valor - a.valor)) {
    const { x, y } = pos(p), w = texto(p).length * CHAR_PX;
    const aDireita = x + 12 + w <= largura - 4;
    const [x0, x1] = aDireita ? [x + 12, x + 12 + w] : [x - 12 - w, x - 12];
    if (x0 < 0 || y < 8 || y > alto - 8 || caixas.some(([a, b, c, d]) => x0 < b + 4 && x1 + 4 > a && y - 8 < d && y + 8 > c)) continue;
    caixas.push([x0, x1, y - 7, y + 7]);
    (aDireita ? dir : esq).push(p);
    if (dir.length + esq.length === n) break;
  }
  return { dir, esq };
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
  const texto = (p: PontoMapa) => `${p.rotulo}  ${fmt(p.valor)}`;
  const rotulos = rotulaveis(pontos, 5, shell.larguraDe(alvo), alto, texto);
  shell.desenhar(alvo, {
    height: alto,
    margin: 4,
    projection: { type: "mercator", domain: ufGeo as never },
    color: { type: "sqrt", range: [C.o100, C.o500], unknown: "#F6EFE4" },
    r: { range: [2, 15] },
    marks: [
      Plot.geo(geo as never, {
        ariaDescription: "estados",
        ariaLabel: (f: { properties: { uf: string } }) => f.properties.uf,
        fill: (f: { properties: { uf: string } }) => porUf.get(f.properties.uf),
        stroke: (f: { properties: { uf: string } }) => (ufsAtivas.includes(f.properties.uf) ? C.o700 : "#fff"),
        strokeWidth: (f: { properties: { uf: string } }) => (ufsAtivas.includes(f.properties.uf) ? 2 : 1),
        title: (f: { properties: { uf: string } }) => `${f.properties.uf}: ${porUf.has(f.properties.uf) ? fmt(porUf.get(f.properties.uf)!) : "sem dado"}`,
      }),
      Plot.geo(geo as never, Plot.pointer(Plot.centroid({ stroke: C.o700, strokeWidth: 2, fill: "none", pointerEvents: "none" }))),
      Plot.dot(pontos, { x: "lon", y: "lat", r: "valor", fill: C.verde, fillOpacity: 0.55, stroke: "#2F5E14", strokeWidth: 0.8, title: (p: PontoMapa) => `${p.rotulo}: ${fmt(p.valor)}` }),
      ...[[rotulos.dir, 12, "start"], [rotulos.esq, -12, "end"]].map(([ps, dx, ancora]) =>
        Plot.text(ps as PontoMapa[], {
          x: "lon", y: "lat", text: texto, dx: dx as number, textAnchor: ancora as "start" | "end",
          fontSize: 11, fontWeight: 600, fill: C.ink, stroke: "#fff", strokeWidth: 3,
        })),
    ],
  });
  const svg = shell.svg(alvo);
  if (!svg) return;
  // Estado sob o clique, não o centroide mais próximo: ponto e rótulo por cima não roubam o clique.
  svg.addEventListener("click", (ev) => {
    const uf = document.elementsFromPoint(ev.clientX, ev.clientY)
      .find((el) => el.tagName === "path" && el.parentElement?.getAttribute("aria-description") === "estados")
      ?.getAttribute("aria-label");
    if (uf) aoClicarUf(uf);
  });
}
