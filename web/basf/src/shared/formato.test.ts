import { expect, test } from "bun:test";
import { euroCompacto, moedaCompacta, n0 } from "./formato";

test("n0 arredonda para inteiro", () => {
  expect(n0(1234.6)).toBe("1.235");
  expect(n0(null)).toBe("—");
});

test("moedaCompacta abrevia em bi, mi e mil; abaixo de mil fica cheio", () => {
  expect(moedaCompacta(2.5e9)).toBe("R$ 2,5 bi");
  expect(moedaCompacta(29_040_000)).toBe("R$ 29,0 mi");
  expect(moedaCompacta(481_174.7)).toBe("R$ 481 mil");
  expect(moedaCompacta(-481_174.7)).toBe("R$ -481 mil");
  expect(moedaCompacta(950)).toBe("R$ 950,00");
  expect(moedaCompacta(null)).toBe("—");
});

test("moedaCompacta arredonda antes de escolher a unidade", () => {
  expect(moedaCompacta(999_600)).toBe("R$ 1,0 mi");
  expect(moedaCompacta(999_400)).toBe("R$ 999 mil");
  expect(moedaCompacta(1_000_000)).toBe("R$ 1,0 mi");
});

test("euroCompacto usa Mi, mil e valor cheio", () => {
  expect(euroCompacto(4_200_000)).toBe("€ 4,2 Mi");
  expect(euroCompacto(999_600)).toBe("€ 1,0 Mi");
  expect(euroCompacto(120_000)).toBe("€ 120 mil");
  expect(euroCompacto(950)).toBe("€ 950,00");
  expect(euroCompacto(null)).toBe("—");
});
