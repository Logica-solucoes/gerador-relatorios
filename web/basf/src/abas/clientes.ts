import { filtrar, share, total } from "../calc";
import { kpi, seg } from "../componentes";
import { busca, normalizar } from "../shared/filtros";
import { esc, moedaCompacta, n0, nf } from "../shared/formato";
import { ICONE } from "../shared/icones";
import type { Linha } from "../types";
import type { DefAba } from "./tipos";

const pct = (v: number | null) => (v == null ? "—" : `${nf(v * 100, 1)}%`);
const GENERICOS = new Set(["DIVERSOS"]);
const COLS = 8;

function barraShare(v: number | null): string {
  if (v == null) return "—";
  return `<span class="bmd-sh"><s><u style="width:${Math.min(100, v * 100).toFixed(0)}%"></u></s>${nf(v * 100, 0)}%</span>`;
}

function ficha(ls: Linha[]): string {
  const pot = total(ls, "potencial"), vend = total(ls, "vendasPotencial");
  const porCrop = [...new Set(ls.map((l) => String(l.crop)))].map((c) => {
    const x = ls.filter((l) => l.crop === c);
    return `<tr><td>${esc(c)}</td><td class="n bmd-mono">${n0(total(x, "area"))}</td><td class="n bmd-mono">${n0(total(x, "dose"))}</td>
      <td class="n bmd-mono">${n0(total(x, "mercado"))}</td><td class="n bmd-mono">${n0(total(x, "copa") ?? 0)}</td><td class="n bmd-mono">${n0(total(x, "potencial"))}</td></tr>`;
  }).join("");
  const espaco = pot != null ? pot - (vend ?? 0) : null;
  return `<tr class="bmd-ficha"><td colspan="${COLS}"><div>
    <div class="bmd-ficha__g">
      <div class="bmd-card"><span class="bmd-lbl">Potencial cliente</span><b>${moedaCompacta(pot)}</b></div>
      <div class="bmd-card"><span class="bmd-lbl">Vendas BASF</span><b>${moedaCompacta(vend)}</b></div>
      <div class="bmd-card"><span class="bmd-lbl">Espaço a capturar</span><b class="bmd-ac">${moedaCompacta(espaco)}</b></div>
      <div class="bmd-card"><span class="bmd-lbl">Dose média</span><b>${total(ls, "dose") == null ? "—" : `${n0(total(ls, "dose"))} TH/ha`}</b></div>
    </div>
    <table class="bmd-tb2"><thead><tr><th>Crop</th><th class="n">Área</th><th class="n">Dose</th><th class="n">Mercado TH</th><th class="n">Vendas copa</th><th class="n">Potencial R$</th></tr></thead><tbody>${porCrop}</tbody></table>
  </div></td></tr>`;
}

export const clientes: DefAba = {
  id: "clientes",
  rotulo: "Clientes-chave",
  recursos: () => ["clientes", "basf"],
  chips: () => ({ dims: { ano: "Ano", rtv: "RTV", hotspot: "Hotspot", crop: "Crop", acesso: "Acesso" }, origem: "clientes" }),
  controles: (e) => seg("agrupar", { hotspot: "Hotspot", rtv: "RTV", crop: "Crop" }, e.agrupar),

  render(ctx, corpo) {
    const e = ctx.estado;
    const f = e.filtros.clientes;
    const termo = normalizar((corpo.querySelector<HTMLInputElement>(".bmd-busca")?.value ?? "").trim());
    let ls = filtrar(ctx.dados.clientes ?? [], f);
    if (termo) ls = ls.filter((l) => normalizar(String(l.cliente ?? "")).includes(termo));

    const shareCopa = share(total(ls, "copa"), total(ls, "mercado"));
    // 80-20: TH da key list ÷ TH da BASF no mesmo ano/hotspot/crop/rtv.
    const fBasf = Object.fromEntries(Object.entries(f).filter(([k]) => ["ano", "hotspot", "crop", "rtv"].includes(k)));
    const thBasf = total(filtrar(ctx.dados.basf ?? [], { ...fBasf, ano: fBasf.ano ?? ["2024"] }), "th");
    const enx = total(ls, "enxertia");
    const nClientes = new Set(ls.map((l) => l.cliente)).size;

    const grupos = new Map<string, Linha[]>();
    for (const l of ls) { const k = String(l[e.agrupar] ?? "—"); (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(l); }
    const ordem = [...grupos].sort((a, b) => (total(b[1], "mercado") ?? 0) - (total(a[1], "mercado") ?? 0));

    const linhas = ordem.map(([g, xs]) => {
      const porCliente = new Map<string, Linha[]>();
      for (const l of xs) { const k = String(l.cliente); (porCliente.get(k) ?? porCliente.set(k, []).get(k)!).push(l); }
      const cab = `<tr class="bmd-grp"><td colspan="5">${esc(g)} · ${porCliente.size} cliente${porCliente.size > 1 ? "s" : ""}</td>
        <td class="n bmd-mono">${n0(total(xs, "mercado"))}</td><td class="n bmd-mono">${n0(total(xs, "copa") ?? 0)}</td><td>${barraShare(share(total(xs, "copa"), total(xs, "mercado")))}</td></tr>`;
      const cls = [...porCliente].sort((a, b) => (total(b[1], "mercado") ?? 0) - (total(a[1], "mercado") ?? 0)).map(([c, cs]) => {
        const id = `${g}|${c}`;
        const aberto = e.clienteAberto === id;
        const crops = [...new Set(cs.map((x) => String(x.crop)))].map((x) => `<span class="bmd-tag">${esc(x)}</span>`).join(" ");
        const generico = GENERICOS.has(c.toUpperCase()) ? ' <span class="bmd-tag bmd-tag--gen">genérico</span>' : "";
        return `<tr class="bmd-cli${aberto ? " is-open" : ""}" data-cliente="${esc(id)}"><td>${aberto ? ICONE.aberto : ICONE.abrir}<b title="${esc(c)}">${esc(c)}</b>${generico}</td>
          <td>${esc(String(cs[0]!.rtv ?? "—"))}</td><td>${crops}</td><td>${esc(String(cs[0]!.acesso ?? "—"))}</td>
          <td class="n bmd-mono">${n0(total(cs, "area"))}</td><td class="n bmd-mono">${n0(total(cs, "mercado"))}</td>
          <td class="n bmd-mono">${n0(total(cs, "copa") ?? 0)}</td><td>${barraShare(share(total(cs, "copa"), total(cs, "mercado")))}</td></tr>${aberto ? ficha(ls.filter((l) => l.cliente === c)) : ""}`;
      }).join("");
      return cab + cls;
    }).join("");

    const antigo = corpo.querySelector<HTMLInputElement>(".bmd-busca");
    const buscaAtual = antigo?.value ?? "";
    const tinhaFoco = antigo != null && antigo === document.activeElement;
    const caret = antigo?.selectionStart ?? buscaAtual.length;
    corpo.innerHTML = `
      <div class="bmd-kpis2">
        ${kpi({ rotulo: "Customer share (copa)", valor: pct(shareCopa), destaque: true, proporcao: shareCopa, nota: `${nf((total(ls, "copa") ?? 0) / 1e6, 2)} Mi de ${nf((total(ls, "mercado") ?? 0) / 1e6, 2)} Mi TH` })}
        ${kpi({ rotulo: "80-20", valor: pct(share(total(ls, "mercado"), thBasf)), nota: "do mercado BASF está na key list" })}
        ${kpi({ rotulo: "Clientes", valor: n0(nClientes), nota: `${new Set(ls.map((l) => l.rtv)).size} RTVs · ${new Set(ls.map((l) => l.crop)).size} crops` })}
        ${kpi({ rotulo: "Penetração enxertia", valor: pct(share(enx, total(ls, "mercado"))), nota: enx == null ? "sem enxertia preenchida" : "" })}
      </div>
      <div class="bmd-card bmd-tabela">
        <div class="bmd-tabela__topo" data-el="busca"></div>
        <table class="bmd-tb2"><thead><tr><th>Cliente</th><th>RTV</th><th>Crop</th><th>Acesso</th><th class="n">Área (ha)</th><th class="n">Mercado (TH)</th><th class="n">Vendas copa (TH)</th><th>Share</th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="${COLS}" class="bmd-nota">Nenhum cliente neste recorte.</td></tr>`}</tbody></table>
      </div>`;

    const campo = busca("Buscar cliente", [...new Set((ctx.dados.clientes ?? []).map((l) => String(l.cliente)))].sort(), () => ctx.mudar((s) => ({ ...s })));
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
