import type { DefAba } from "./abas/tipos";
import { mercado } from "./abas/mercado";
import { comparativo } from "./abas/comparativo";
import { clientes } from "./abas/clientes";
import { vendas } from "./abas/vendas";

/** Um dashboard = título do hero + abas. O shell, o estado e os dados são os mesmos. */
export interface Painel { titulo: string; abas: DefAba[] }

export const MERCADO: Painel = { titulo: "Inteligência de Mercado", abas: [mercado, comparativo, clientes, vendas] };
