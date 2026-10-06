import type { DefAba } from "./abas/tipos";
import { mercado } from "./abas/mercado";
import { comparativo } from "./abas/comparativo";
import { clientes } from "./abas/clientes";
import { vendas } from "./abas/vendas";
import { analise } from "./abas/sales/analise";
import { evolucao } from "./abas/sales/evolucao";
import { tabela } from "./abas/sales/tabela";

/** Um dashboard = um conjunto de abas. O shell, o estado e os dados são os mesmos. */
export interface Painel { abas: DefAba[] }

export const MERCADO: Painel = { abas: [mercado, comparativo, clientes, vendas] };

export const SALES: Painel = { abas: [evolucao, analise, tabela] };
