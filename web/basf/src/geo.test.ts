import { describe, expect, test } from "bun:test";
import { corrigirAneis, horario } from "./geo";

// Quadrado com furo, ambos anti-horários (como a API do IBGE entrega, RFC 7946).
const fora = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const furo = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
const fc = () => ({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [structuredClone(fora), structuredClone(furo)] } },
    { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: [[structuredClone(fora)]] } },
  ],
});

describe("corrigirAneis", () => {
  test("exterior fica horário e furo anti-horário (o que o d3 espera)", () => {
    const r = corrigirAneis(fc());
    const [ext, buraco] = r.features[0]!.geometry.coordinates as number[][][];
    expect(horario(ext!)).toBe(true);
    expect(horario(buraco!)).toBe(false);
    const multi = r.features[1]!.geometry.coordinates as number[][][][];
    expect(horario(multi[0]![0]!)).toBe(true);
  });
  test("idempotente: aplicar duas vezes não desfaz", () => {
    const r = corrigirAneis(corrigirAneis(fc()));
    expect(horario(r.features[0]!.geometry.coordinates[0] as number[][])).toBe(true);
  });
});
