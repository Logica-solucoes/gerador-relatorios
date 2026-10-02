import { ordenarAnos, tabelaAnos, type LinhaAnos } from "../../calc";
import { classeDelta, deltaPct, seg } from "../../componentes";
import { busca, normalizar } from "../../shared/filtros";
import { esc, n0 } from "../../shared/formato";
import { ICONE } from "../../shared/icones";
import type { DefAba } from "../tipos";
import { DIMS, MESES, controlesBase, recorte, semResultado } from "./comum";

export const tabela: DefAba = {
  id: "tabela",
  rotulo: "Tabela",
  recursos: () => ["vendas", "meta"],
  chips: () => ({ dims: DIMS, origem: "vendas" }),
  controles: (e, d) => seg("tabela", { variedade: "Variedade", cliente: "Cliente" }, e.tabela) + controlesBase(e, d),

  render(ctx, corpo) {
    const r = recorte(ctx);
    if (!r.base.length) return semResultado(ctx, corpo);
    const e = ctx.estado;
    const porVariedade = e.tabela === "variedade";
    const dim = porVariedade ? "variedade" : "cliente";

    // Busca vive no DOM (como em Clientes-chave). Trocar de modo zera: termo de cliente não acha variedade.
    const antigo = corpo.querySelector<HTMLInputElement>(".bmd-busca");
    const mesmoModo = corpo.dataset.modo === e.tabela;
    const buscaAtual = mesmoModo ? antigo?.value ?? "" : "";
    const tinhaFoco = mesmoModo && antigo != null && antigo === document.activeElement;
    const caret = antigo?.selectionStart ?? buscaAtual.length;
    const termo = normalizar(buscaAtual.trim());
    const ls = termo ? r.base.filter((l) => normalizar(String(l[dim] ?? "")).includes(termo)) : r.base;

    const t = tabelaAnos(ls, dim, porVariedade ? "crop" : null, r.ano, r.mesCorte, r.campo, r.conv, r.minimo);
    const { col, desc } = e.ordem;
    const unidade = r.campo === "th" ? "TH" : r.eur ? "€" : "R$";
    const cab = [String(r.ano - 2), String(r.ano - 1), r.periodo, `Var. vs ${r.ano - 1}${r.mesCorte < 12 ? ` até ${MESES[r.mesCorte - 1]}` : ""}`];
    const th = (rot: string, i: number, cls = "n") =>
      `<th class="${cls}"><button type="button" class="bmd-ord${col === i ? " is-on" : ""}" data-ordem="${i}">${esc(rot)}${col === i ? (desc ? " ↓" : " ↑") : ""}</button></th>`;
    const cel = (l: LinhaAnos) => l.v.map((v) => `<td class="n bmd-mono">${v == null ? "" : n0(v)}</td>`).join("") +
      `<td class="n bmd-mono ${classeDelta(l.variacao)}">${deltaPct(l.variacao)}</td>`;
    const item = (l: LinhaAnos, recuo: boolean) => `<tr><td${recuo ? ' class="bmd-ind"' : ""} title="${esc(l.chave)}">${esc(l.chave)}</td>${cel(l)}</tr>`;

    const corpoTabela = ordenarAnos(t.grupos, col, desc).map((g) => {
      if (!porVariedade) return ordenarAnos(g.itens, col, desc).map((l) => item(l, false)).join("");
      const fechado = e.recolhidos.includes(g.chave);
      return `<tr class="bmd-grp bmd-grp--clic" data-recolher="${esc(g.chave)}"><td>${fechado ? ICONE.abrir : ICONE.aberto} ${esc(g.chave)} · ${g.itens.length}</td>${cel(g)}</tr>` +
        (fechado ? "" : ordenarAnos(g.itens, col, desc).map((l) => item(l, true)).join(""));
    }).join("");

    corpo.dataset.modo = e.tabela;
    corpo.innerHTML = `
      <div class="bmd-card bmd-tabela">
        <div class="bmd-tabela__topo" data-el="busca"></div>
        <table class="bmd-tb2 bmd-tb2--anos"><thead><tr>${th(`${porVariedade ? "Variedade" : "Cliente"} · ${unidade}`, -1, "")}${cab.map((c, i) => th(c, i)).join("")}</tr></thead>
        <tbody>${corpoTabela || '<tr><td colspan="5" class="bmd-nota">${termo ? "Nada encontrado para esta busca." : `Sem venda de ${r.ano - 2} a ${r.periodo} neste recorte.`}</td></tr>'}</tbody>
        <tfoot><tr class="bmd-tot"><td>Total</td>${cel(t.total)}</tr></tfoot></table>
      </div>`;

    corpo.querySelectorAll<HTMLElement>("[data-ordem]").forEach((b) => b.addEventListener("click", () => {
      const c = Number(b.dataset.ordem);
      ctx.mudar((s) => ({ ...s, ordem: { col: c, desc: s.ordem.col === c ? !s.ordem.desc : c !== -1 } }));
    }));
    corpo.querySelectorAll<HTMLElement>("[data-recolher]").forEach((tr) => tr.addEventListener("click", () => {
      const g = tr.dataset.recolher!;
      ctx.mudar((s) => ({ ...s, recolhidos: s.recolhidos.includes(g) ? s.recolhidos.filter((x) => x !== g) : [...s.recolhidos, g] }));
    }));

    const opcoes = [...new Set(r.base.map((l) => String(l[dim] ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const campo = busca(porVariedade ? "Buscar variedade" : "Buscar cliente", opcoes, () => ctx.mudar((s) => ({ ...s })));
    ctx.shell.el("busca").append(campo.el);
    const input = campo.el.querySelector<HTMLInputElement>("input")!;
    input.value = buscaAtual;
    if (tinhaFoco) {
      input.focus();
      input.setSelectionRange(caret, caret);
      // o focus reabre a lista de sugestões; Esc fecha sem limpar o texto
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }
  },
};
