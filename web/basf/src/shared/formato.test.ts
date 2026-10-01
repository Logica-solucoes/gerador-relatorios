import { expect, test } from "bun:test";
import { n0 } from "./formato";

test("n0 arredonda para inteiro", () => {
  expect(n0(1234.6)).toBe("1.235");
  expect(n0(null)).toBe("—");
});
