/**
 * A malha do IBGE vem com exteriores anti-horários (RFC 7946). O d3-geo, usado pelo Plot,
 * lê anti-horário como "o globo menos este polígono" e pinta um quadrado cheio no mapa.
 * Aqui orientamos pelo sinal da área: exterior horário, furo anti-horário. Idempotente.
 */
type Anel = number[][];
interface Geometria { type: string; coordinates: unknown }
interface Feicao { type: string; properties: Record<string, unknown>; geometry: Geometria }
export interface Colecao { type: string; features: Feicao[] }

/** Horário em lon/lat (y para cima): soma de (x2−x1)(y2+y1) positiva. */
export function horario(anel: Anel): boolean {
  let s = 0;
  for (let i = 0; i < anel.length - 1; i++) {
    const [x1, y1] = anel[i]!, [x2, y2] = anel[i + 1]!;
    s += (x2! - x1!) * (y2! + y1!);
  }
  return s > 0;
}

function orientar(poligono: Anel[]): void {
  poligono.forEach((anel, i) => {
    const querHorario = i === 0;
    if (horario(anel) !== querHorario) anel.reverse();
  });
}

export function corrigirAneis<T extends Colecao>(fc: T): T {
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === "Polygon") orientar(g.coordinates as Anel[]);
    else if (g.type === "MultiPolygon") (g.coordinates as Anel[][]).forEach(orientar);
  }
  return fc;
}
