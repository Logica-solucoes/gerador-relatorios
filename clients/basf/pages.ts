import type { Dados } from "./queries";
import { graficos as g, CULTURA, culturaVariacao } from "./report";
import { mi, num, pct, sinal, curto, dt, varPct } from "../../core/report";
import { narrar, subst, metaCobertura, prioridadeAcao } from "./narrativa";

export const titulo = "BASF Sementes — Diagnóstico Executivo YTD 2026";

const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

/** KPI card. delta negativo pinta vermelho. */
function kpi(label: string, valor: string, unidade: string, delta: number, base: string) {
  return `<div class="card kpi">
    <div class="label">${label}</div>
    <div class="value">${valor}<span class="unit">${unidade}</span></div>
    <div class="delta ${delta < 0 ? "neg" : "pos"}">${sinal(delta)} vs 2025</div>
    <div class="small muted" style="margin-top:1mm">${base}</div>
  </div>`;
}

export function documento(d: Dados): string {
  const a = d.kpis.find((k) => k.ano === 2025)!;
  const b = d.kpis.find((k) => k.ano === 2026)!;
  const ticket = (k: typeof a) => k.fat / k.pedidos;
  const queda = a.fat - b.fat;

  const br25 = d.precoVolume.find((r) => r.mercado === "Brasil" && r.ano === 2025)!;
  const br26 = d.precoVolume.find((r) => r.mercado === "Brasil" && r.ano === 2026)!;
  const precoBr = (r: typeof br25) => r.fat / r.vol;

  const perdidos = d.coorte.find((c) => c.status === "Perdido")!;
  const novos = d.coorte.find((c) => c.status === "Novo")!;
  const reativados = d.coorte.find((c) => c.status === "Reativado")!;
  const retidos = d.coorte.find((c) => c.status === "Retido")!;
  const top10 = d.pareto.slice(0, 10).reduce((s, r) => s + r.fat, 0);
  const nunhems = d.pareto[0]!;
  const umMes = d.frequencia.find((f) => f.meses === 1)!;
  const dormTotal = d.dormentes.reduce((s, r) => s + r.fat25, 0);
  const monoTotal = d.monoCultura.reduce((s, r) => s + r.fat, 0);
  const c1 = d.culturasPorCliente.find((c) => c.culturas === 1)!;
  const c2 = d.culturasPorCliente.find((c) => c.culturas === 2)!;
  const op = d.operacional;
  const exportDelta = d.bridge.find((x) => x.etapa === "Export (intercompany)")!.valor;
  const retidoDelta = d.bridge.find((x) => x.etapa === "Retidos (variacao)")!.valor;
  const brDelta = queda - Math.abs(exportDelta);
  // Afirmacoes sensiveis ao sinal dos dados vivem em narrativa.ts
  const n = narrar(d, culturaVariacao(d));

  // Fonte unica dos titulos: alimenta o <h2> de cada pagina e o indice da capa,
  // entao renomear uma secao nao deixa o indice mentindo. Indice comeca na p.2.
  const secoes = [
    n.tituloBridge,
    "São dois negócios, não um",
    "Onde está a margem escondida",
    "A carteira está concentrada e encolhendo",
    `Clientes dormentes: R$ ${mi(dormTotal)} Mi na mesa`,
    "Vazamento de preço",
    "Cross-sell: a base compra uma cultura só",
    "Qualidade operacional",
    "Plano de ação",
  ];

  return `
<div class="page capa">
  <div class="topo">
    <div class="logo"><span class="mark"></span>BASF <span class="sub">Sementes</span></div>
  </div>

  <div>
    <div class="eyebrow">Diagnóstico executivo · Janeiro a Junho de 2026</div>
    <h1>${n.manchete}</h1>
    <div class="rule"></div>
    <p class="lead" style="max-width:44em">${n.resumo}</p>
  </div>

  <div style="margin-top:9mm">
    <div class="row">
      ${kpi("Faturamento", "R$ " + mi(b.fat), " Mi", varPct(a.fat, b.fat), "era R$ " + mi(a.fat) + " Mi")}
      ${/* vol vem em MILHARES de sementes (inv_qty_th) → /1e6 = bilhões */ ""}
      ${kpi("Volume", num(b.vol / 1e6, 2), " Bi sem.", varPct(a.vol, b.vol), "era " + num(a.vol / 1e6, 2) + " Bi sementes")}
      ${kpi("Clientes ativos", num(b.clientes), "", varPct(a.clientes, b.clientes), num(perdidos.clientes) + " deixaram de comprar")}
      ${kpi("Ticket por pedido", "R$ " + num(ticket(b) / 1000), "k", varPct(ticket(a), ticket(b)), num(b.pedidos) + " pedidos no período")}
    </div>
  </div>

  <div style="margin-top:7mm" class="callout alerta">
    <span class="tag">O que exige decisão agora:</span>
    o volume ${n.varVol < 0 ? "caiu" : "subiu"} <strong>${sinal(n.varVol)}</strong>, contra
    <strong>${sinal(n.varFat)}</strong> de receita.
    A carteira perdeu <strong>${perdidos.clientes} clientes</strong> e repôs
    <strong>${novos.clientes}</strong>. E ${num(op.cli_vendedor_br90)} dos ${num(op.cli_total)} clientes
    ativos estão sob um único vendedor.
  </div>

  <div class="indice">
    <div class="eyebrow" style="color:var(--muted-foreground)">Neste relatório</div>
    <ol>
      ${secoes.map((s, i) => `<li><span class="p">${i + 2}</span>${s}</li>`).join("")}
    </ol>
  </div>

  <div class="rodape small muted">
    Base: ${num(10070)} linhas de faturamento (2022–2026), sistema de vendas BASF Sementes.
    Recorte YTD janeiro–junho nos dois anos. Dados até 25/06/2026. Emitido em ${hoje}.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[0]}</h2>
    <p class="muted">Decomposição da variação YTD 2025 → 2026. As quatro etapas somadas fecham exatamente na receita de 2026.</p>
  </header>

  ${g.gWaterfall(d)}
  <figcaption>Valores em R$ milhões. Vermelho reduz, verde acrescenta.</figcaption>

  <section class="row" style="margin-top:6mm">
    <div class="card">
      <h3>Export responde por ${pct((Math.abs(exportDelta) / Math.abs(queda)) * 100, 0)} d${subst(n.varFat) === "queda" ? "a queda" : "a alta"}</h3>
      <p class="muted">A Nunhems Netherlands — operação intercompany, não mercado —
      ${exportDelta < 0 ? "encolheu" : "cresceu"} R$ ${mi(Math.abs(exportDelta))} Mi sozinha.
      É o maior componente isolado e não reflete demanda de cliente final brasileiro.</p>
    </div>
    <div class="card">
      <h3>O mercado BR ${brDelta > 0 ? "caiu" : "subiu"} R$ ${mi(Math.abs(brDelta))} Mi</h3>
      <p class="muted">Descontado o export, sobra a variação real de mercado: clientes que
      pararam de comprar (R$ ${mi(Math.abs(perdidos.fat))} Mi) e clientes que continuaram
      comprando ${retidoDelta < 0 ? "menos" : "mais"} (R$ ${mi(Math.abs(retidoDelta))} Mi).</p>
    </div>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Leitura:</span> a maior parcela isolada é venda entre empresas do grupo
    (intercompany), o que suaviza o diagnóstico comercial — mas os R$ ${mi(Math.abs(brDelta))} Mi restantes são mercado real,
    e vieram majoritariamente de clientes que <em>já eram nossos</em>, não de falta de prospecção.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[1]}</h2>
    <p class="muted">Mercado brasileiro e venda intercompany (entre empresas do grupo) têm dinâmicas distintas. Somados, escondem o problema.</p>
  </header>

  ${g.gMensal(d)}
  <figcaption>Faturamento mensal em R$ milhões, 2022–2026.</figcaption>

  <section class="row" style="margin-top:6mm">
    <figure>
      <h3>${n.tituloMix}</h3>
      ${g.gReceitaVolume(d)}
      <figcaption>Variação YTD 2026 vs 2025.</figcaption>
    </figure>
    <div class="card">
      <h3>O que o preço médio revela</h3>
      <p class="muted">No Brasil o volume ${varPct(br25.vol, br26.vol) < 0 ? "caiu" : "subiu"}
      ${sinal(varPct(br25.vol, br26.vol))} e a receita ${sinal(varPct(br25.fat, br26.fat))}.
      O preço médio foi de <strong>R$ ${num(precoBr(br25), 2)}</strong> para
      <strong>R$ ${num(precoBr(br26), 2)}</strong> por mil sementes.</p>
      <p class="muted" style="margin-top:2.5mm">${n.textoMix}</p>
    </div>
  </section>

  <div class="callout ${varPct(br25.vol, br26.vol) < 0 ? "alerta" : ""}" style="margin-top:5mm">
    <span class="tag">${varPct(br25.vol, br26.vol) < 0 ? "Risco:" : "Leitura:"}</span> volume é o
    indicador antecedente. ${sinal(varPct(br25.vol, br26.vol))} em sementes entregues significa
    ${varPct(br25.vol, br26.vol) < 0 ? "menos" : "mais"} hectares plantados com material BASF nesta
    safra — e ${varPct(br25.vol, br26.vol) < 0 ? "menos" : "mais"} recompra na próxima,
    independentemente do preço.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[2]}</h2>
    <p class="muted">Preço por mil sementes por cultura e por tecnologia de tratamento.</p>
  </header>

  <section class="row">
    <figure>
      <h3>Preço × volume por cultura</h3>
      ${g.gPrecoCultura(d)}
      <figcaption>Variação 2026 vs 2025. Tamanho da bolha = faturamento 2026.</figcaption>
    </figure>
    <div class="card">
      <h3>Leituras por cultura</h3>
      ${n.leiturasCultura}
    </div>
  </section>

  <section style="margin-top:6mm">
    <h3>Faturamento por tecnologia de tratamento</h3>
    ${g.gTratamento(d)}
    <figcaption>Barras em R$ milhões (2026). À direita, o preço médio por mil sementes de cada tecnologia.</figcaption>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Oportunidade:</span> a diferença de preço entre tratamento padrão e as linhas
    premium é de duas ordens de grandeza. Migrar mesmo uma fração pequena do volume padrão para
    tratamento premium move mais margem do que qualquer ganho de volume plausível neste semestre.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[3]}</h2>
    <p class="muted">Distribuição da receita e movimentação de clientes no período.</p>
  </header>

  ${g.gPareto(d)}
  <figcaption>Top 12 clientes por faturamento 2026, em R$ milhões, com participação acumulada.</figcaption>

  <section class="row" style="margin-top:6mm">
    <figure>
      <h3>Movimentação da base</h3>
      ${g.gCoorte(d)}
      <figcaption>Nº de clientes e receita associada, YTD.</figcaption>
    </figure>
    <div class="card">
      <h3>${n.tituloAquisicao}</h3>
      <p class="muted">Saíram <strong>${perdidos.clientes} clientes</strong>
      (R$ ${mi(Math.abs(perdidos.fat))} Mi de receita 2025). Entraram
      <strong>${novos.clientes} novos</strong> (R$ ${mi(novos.fat)} Mi) e
      ${reativados.clientes} reativados (R$ ${mi(reativados.fat)} Mi).</p>
      <p class="muted" style="margin-top:2.5mm"><strong>${pct((retidos.fat / b.fat) * 100, 0)}
      da receita</strong> vem de clientes que já compravam. ${n.textoAquisicao}</p>
    </div>
  </section>

  <div class="callout alerta" style="margin-top:5mm">
    <span class="tag">Concentração:</span> ${nunhems.cliente.split(" ").slice(0, 2).join(" ")}
    representa ${pct(nunhems.acum, 0)} da receita e os 10 maiores somam
    ${pct((top10 / b.fat) * 100, 0)}. Perder um único cliente do topo tem impacto maior que
    perder os ${perdidos.clientes} que já saíram.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[4]}</h2>
    <p class="muted">Compraram em 2025, não compraram nada em 2026. Ordenado por receita perdida.</p>
  </header>

  <table>
    <thead><tr>
      <th>Cliente</th><th class="num">Receita 2025</th><th class="num">Última compra</th><th class="num">Dias parado</th>
    </tr></thead>
    <tbody>
      ${d.dormentes
        .map(
          (r) => `<tr>
        <td class="nome">${curto(r.cliente, 40)}</td>
        <td class="num">R$ ${mi(r.fat25)} Mi</td>
        <td class="num muted">${dt(r.ultima)}</td>
        <td class="num ${r.dias > 300 ? "neg" : ""}">${num(r.dias)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <section class="row" style="margin-top:7mm">
    <figure>
      <h3>Frequência de compra em 2026</h3>
      ${g.gFrequencia(d)}
      <figcaption>Nº de clientes por quantidade de meses com compra.</figcaption>
    </figure>
    <div class="card">
      <h3>Metade da base é intermitente</h3>
      <p class="muted"><strong>${umMes.clientes} dos ${num(b.clientes)} clientes ativos</strong>
      compraram em um único mês do semestre, somando apenas R$ ${mi(umMes.fat)} Mi.
      São relacionamentos transacionais, não contas geridas.</p>
      <p class="muted" style="margin-top:2.5mm">No outro extremo, os clientes que compram
      em 5 ou 6 meses concentram a maior parte da receita. A diferença entre os dois grupos é
      cobertura comercial, não potencial de compra.</p>
    </div>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Ação direta:</span> a tabela acima é uma lista de ligações, não um gráfico.
    Metade desses clientes parou há menos de um ano e ainda tem relacionamento vivo.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[5]}</h2>
    <p class="muted">O mesmo produto, na mesma embalagem, sai por preços muito diferentes dependendo do cliente.</p>
  </header>

  ${g.gSpread(d)}
  <figcaption>Cada linha é um SKU vendido a 6+ clientes no Brasil em 2026, com faturamento acima de R$ 200 mil.
  O ponto azul é o melhor preço praticado; o vermelho, o pior. Comparação sempre dentro da mesma embalagem.</figcaption>

  <section style="margin-top:6mm">
    <h3>${curto(d.dispersao[0]!.item.replace(/^SEMENTES /, ""), 40)} — o SKU de maior faturamento</h3>
    ${g.gDispersao(d)}
  </section>

  <section class="row" style="margin-top:5mm">
    <div class="card">
      <h3>Recuperação estimada: R$ ${mi(d.vazamento.gap_mediana)} Mi</h3>
      <p class="muted">É o que entraria se todo cliente que hoje paga <em>abaixo da mediana</em>
      do próprio SKU passasse a pagar a mediana. Estimativa conservadora e deliberada: o teto
      teórico, se todos pagassem o melhor preço, seria R$ ${mi(d.vazamento.gap_maximo)} Mi.</p>
      <p class="muted" style="margin-top:2.5mm"><strong>Ressalva:</strong> parte do desconto
      é legítima — volume, contrato, negociação de safra. O número não é dinheiro roubado, é a
      medida de quanta variação existe sem política de preço formal por trás.</p>
    </div>
    <div class="card">
      <h3>Quem compra sistematicamente abaixo</h3>
      <table style="margin-top:1mm">
        <thead><tr><th>Cliente</th><th class="num">Desvio</th><th class="num">Receita</th></tr></thead>
        <tbody>
          ${d.abaixoMedia
            .slice(0, 6)
            .map(
              (r) => `<tr><td class="nome">${curto(r.cliente, 24)}</td>
              <td class="num neg">${num(r.desvio, 1)}%</td>
              <td class="num">R$ ${mi(r.fat)} Mi</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="muted" style="margin-top:2mm">Desvio médio vs. o preço médio de cada item que
      o cliente compra. Apenas clientes com 5+ linhas e receita acima de R$ 200 mil.</p>
    </div>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[6]}</h2>
    <p class="muted">Amplitude de portfólio por cliente no mercado brasileiro, 2026.</p>
  </header>

  <section class="row">
    <figure>
      <h3>Ticket médio por amplitude</h3>
      ${g.gCrossSell(d)}
      <figcaption>Receita média por cliente conforme o nº de culturas compradas.</figcaption>
    </figure>
    <div class="card">
      <h3>O salto está entre 1 e 2</h3>
      <p class="muted"><strong>${c1.clientes} dos ${c1.clientes + c2.clientes + (d.culturasPorCliente[2]?.clientes ?? 0)}
      clientes brasileiros</strong> compram uma única cultura, com ticket médio de
      R$ ${num(c1.ticket / 1000)} mil. Quem compra duas tem ticket de
      R$ ${num(c2.ticket / 1000)} mil — <strong>${num(c2.ticket / c1.ticket, 1)}× maior</strong>.</p>
      <p class="muted" style="margin-top:2.5mm"><strong>É associação, não causalidade:</strong>
      contas maiores naturalmente compram mais itens. O múltiplo não deve ser aplicado como meta
      por cliente.</p>
      <p class="muted" style="margin-top:2.5mm">O que o dado sustenta é mais específico —
      a lista abaixo mostra contas <em>grandes</em> presas a uma cultura só. Para o porte delas,
      isso é anomalia comercial, não perfil de compra.</p>
    </div>
  </section>

  <section style="margin-top:7mm">
    <h3>Alvos nominais — maiores clientes mono-cultura</h3>
    <table style="margin-top:2mm">
      <thead><tr>
        <th>Cliente</th><th>Única cultura que compra</th><th class="num">Receita 2026</th><th class="num">Porte vs. média mono</th>
      </tr></thead>
      <tbody>
        ${d.monoCultura
          .map(
            (r) => `<tr>
          <td class="nome">${curto(r.cliente, 38)}</td>
          <td><span class="chip">${CULTURA[r.cultura] ?? r.cultura}</span></td>
          <td class="num">R$ ${mi(r.fat)} Mi</td>
          <td class="num muted">${num(r.fat / c1.ticket, 1)}×</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <figcaption>A última coluna mostra o porte de cada conta em relação ao ticket médio de um cliente
    mono-cultura. Todas estão acima da média — são contas grandes, não compradores pequenos.</figcaption>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Total em jogo:</span> esses ${d.monoCultura.length} clientes somam
    R$ ${mi(monoTotal)} Mi hoje e já têm relacionamento ativo, equipe técnica conhecida e
    logística estabelecida. É a lista de cross-sell com menor custo de aquisição da carteira.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[7]}</h2>
    <p class="muted">Sinais que não aparecem no resultado, mas explicam parte dele.</p>
  </header>

  <section class="row">
    <figure>
      <h3>Devoluções sobre faturamento bruto</h3>
      ${g.gDevolucoes(d)}
      <figcaption>${n.legendaDevolucoes}</figcaption>
    </figure>
    <figure>
      <h3>Pedidos de última hora</h3>
      ${g.gUrgencia(d)}
      <figcaption>% de pedidos com 1 dia ou menos entre pedido e data desejada.</figcaption>
    </figure>
  </section>

  <section class="row" style="margin-top:6mm">
    <div class="card">
      <h3 class="neg">R$ ${mi(op.sales_error)} Mi em "SALES ERROR"</h3>
      <p class="muted">É o maior motivo isolado de devolução em 2026 — erro de venda, não
      recusa do cliente. Um problema de processo interno custando mais que muitos clientes inteiros.</p>
    </div>
    <div class="card">
      <h3>${pct(op.fat_apos_req, 0)} faturado após a data pedida</h3>
      <p class="muted">Uma em cada cinco notas sai depois da data que o próprio cliente
      solicitou. Combinado com ${pct(d.urgencia.at(-1)!.perc, 0)} de pedidos urgentes, indica
      planejamento de demanda quebrado nas duas pontas.</p>
    </div>
  </section>

  <section class="row" style="margin-top:7mm">
    <div class="card">
      <h3>Portfólio encolheu ${pct((1 - op.itens_total / op.sku_2025) * 100, 0)}</h3>
      <p class="muted">De ${num(op.sku_2025)} SKUs em 2025 para ${num(op.itens_total)} em 2026.
      E ${num(op.itens_80pc)} itens concentram 80% da receita — a cauda longa virou custo sem retorno.</p>
    </div>
    <div class="card">
      <h3 class="neg">Um vendedor, ${num(op.cli_vendedor_br90)} clientes</h3>
      <p class="muted">O código BR90 atende ${num(op.cli_vendedor_br90)} dos
      ${num(op.cli_total)} clientes ativos. Risco de continuidade concentrado em uma pessoa,
      sem redundância de relacionamento.</p>
    </div>
  </section>

  <div class="callout alerta" style="margin-top:5mm">
    <span class="tag">Cobertura contratual:</span> apenas ${pct(op.contrato_pc, 0)} das linhas
    faturadas no Brasil têm acordo comercial registrado. O restante é venda avulsa — sem preço
    acordado, é onde o vazamento da página anterior se origina.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[8]}</h2>
    <p class="muted">Ordenado por relação entre valor em jogo e esforço de execução.</p>
  </header>

  ${(() => {
    // Chip de prioridade e' derivado (tem R$ calculavel? -> Alta), nao fixo por
    // posicao — senao a coluna nao acompanha o valor mudar de um trimestre pro outro.
    const chip = (alta: boolean) => `<span class="chip${alta ? " alta" : ""}">${prioridadeAcao(alta)}</span>`;
    return `
  <table class="acao">
    <thead><tr>
      <th style="width:6mm"></th><th>Ação</th><th style="width:30mm" class="num">Valor em jogo</th>
      <th style="width:22mm">Prazo</th><th style="width:20mm">Prioridade</th>
    </tr></thead>
    <tbody>
      <tr>
        <td class="n">1</td>
        <td><strong>Política de preço mínimo por SKU.</strong> Definir piso por item e embalagem,
        e exigir aprovação para venda abaixo da mediana. Começar pelos ${d.spread.length} SKUs
        com maior dispersão.</td>
        <td class="num">R$ ${mi(d.vazamento.gap_mediana)} Mi</td>
        <td>30 dias</td>
        <td>${chip(true)}</td>
      </tr>
      <tr>
        <td class="n">2</td>
        <td><strong>Recuperar os ${d.dormentes.length} dormentes da página 6.</strong> Contato
        direto do gerente comercial, não do representante. Meta: reativar metade até o fim da safra.</td>
        <td class="num">R$ ${mi(dormTotal)} Mi</td>
        <td>60 dias</td>
        <td>${chip(true)}</td>
      </tr>
      <tr>
        <td class="n">3</td>
        <td><strong>Cross-sell nos ${d.monoCultura.length} mono-cultura.</strong> Oferta técnica
        de uma segunda cultura para quem já compra, com o time agronômico que já atende a conta.</td>
        <td class="num">R$ ${mi(monoTotal)} Mi<br><span class="small muted">Base em risco</span></td>
        <td>1 safra</td>
        <td>${chip(true)}</td>
      </tr>
      <tr>
        <td class="n">4</td>
        <td><strong>Auditar o processo por trás de "SALES ERROR".</strong> ${pct(d.devolucoes.at(-1)!.perc)}
        de devolução, e a causa raiz é interna. ${n.legendaDevolucoes}</td>
        <td class="num">R$ ${mi(op.sales_error)} Mi</td>
        <td>45 dias</td>
        <td>${chip(true)}</td>
      </tr>
      <tr>
        <td class="n">5</td>
        <td><strong>${metaCobertura(op.contrato_pc, 85)}</strong>
        Contrato é o instrumento que sustenta a política de preço da ação 1 — sem ele, a regra
        não tem onde se apoiar.</td>
        <td class="num">Estrutural</td>
        <td>90 dias</td>
        <td>${chip(false)}</td>
      </tr>
      <tr>
        <td class="n">6</td>
        <td><strong>Segundo vendedor no atendimento das contas-chave.</strong> Redundância de
        relacionamento nos 20 maiores clientes, hoje todos sob o mesmo código.</td>
        <td class="num">Mitigação</td>
        <td>90 dias</td>
        <td>${chip(false)}</td>
      </tr>
      <tr>
        <td class="n">7</td>
        <td><strong>Calendário comercial por cultura.</strong> Cada cultura tem janela própria de
        pico. Antecipar a abordagem reduz o volume de pedidos de última hora, hoje em
        ${pct(d.urgencia.at(-1)!.perc, 0)}.</td>
        <td class="num">Previsibilidade</td>
        <td>1 safra</td>
        <td>${chip(false)}</td>
      </tr>`;
  })()}
    </tbody>
  </table>

  <div class="callout" style="margin-top:7mm">
    <span class="tag">Ações 1, 2 e 4 somam R$ ${mi(d.vazamento.gap_mediana + dormTotal + op.sales_error)} Mi</span>
    de receita endereçável com número calculável, no horizonte de uma safra — sem depender de
    conquistar um único cliente novo e sem contar recuperação do volume intercompany.
    A ação 3 protege outros R$ ${mi(monoTotal)} Mi já faturados, mas seu ganho incremental
    depende de negociação e não tem estimativa defensável a partir destes dados.
  </div>

  <div style="margin-top:auto; padding-top:7mm" class="small muted">
    <strong>Notas metodológicas.</strong> Todos os recortes usam janeiro–junho nos dois anos
    comparados; dados de 2026 vão até 25/06. Faturamento é o valor líquido faturado, já incluindo
    devoluções (valores negativos). Preços por mil sementes usam o preço líquido praticado e são
    comparados sempre dentro do mesmo item e embalagem. "Export" agrupa entregas com destino fora
    do Brasil, majoritariamente vendas entre empresas do próprio grupo BASF (não para o cliente
    final). Estimativas de recuperação são referências de ordem de grandeza, não previsões
    orçamentárias.
  </div>
</div>
`;
}
