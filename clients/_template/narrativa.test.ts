import { expect, test } from "bun:test";
import { manchete } from "./narrativa";

test("manchete acompanha o sinal", () => {
  expect(manchete({ kpi: { label: "x", valor2025: 100, valor2026: 150 } })).toContain("cresceu");
  expect(manchete({ kpi: { label: "x", valor2025: 100, valor2026: 50 } })).toContain("caiu");
});
