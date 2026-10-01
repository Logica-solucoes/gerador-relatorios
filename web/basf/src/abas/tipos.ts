import type { Shell } from "../shared/shell";
import type { Estado } from "../estado";
import type { Aba, Linha, Recurso } from "../types";

export type Dados = Partial<Record<Recurso, Linha[]>>;

export interface Ctx {
  shell: Shell;
  estado: Estado;
  dados: Dados;
  /** Aplica uma transformação ao estado e redesenha. */
  mudar(f: (e: Estado) => Estado): void;
}

export interface DefAba {
  id: Aba;
  rotulo: string;
  recursos(e: Estado): Recurso[];
  /** Dimensões dos chips desta aba (dim → rótulo), e de onde tirar as opções. */
  chips(e: Estado): { dims: Record<string, string>; origem: Recurso };
  /** Controles à direita da barra (segmentados), em HTML. */
  controles(e: Estado): string;
  render(ctx: Ctx, corpo: HTMLElement): void;
}
