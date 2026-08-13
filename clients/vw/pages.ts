import type { Dados, Modelo } from "./queries";
import { COLUNAS, lift } from "./queries";
import { graficos as g, COLS_CAMPANHA, rotulo, split } from "./report";
import { num, pct, dt } from "../../core/report";
import * as n from "./narrativa";

export const titulo = "Volkswagen — Lead Scoring: relatório do modelo";

/** Meio-dia UTC: sem hora fixa, "2026-07-13" vira 12/07 no fuso de São Paulo. */
const dia = (s: string) => dt(s.slice(0, 10) + "T12:00:00Z");
const p1 = (v: number, d = 1) => pct(v * 100, d);
const n3 = (v: number) => num(v, 3).replace("0,", ",");

/** KPI sem comparação temporal — aqui não há ano anterior, só o valor e o contexto. */
function kpi(label: string, valor: string, unidade: string, nota: string) {
  return `<div class="card kpi">
    <div class="label">${label}</div>
    <div class="value">${valor}<span class="unit">${unidade}</span></div>
    <div class="small muted" style="margin-top:1.5mm">${nota}</div>
  </div>`;
}

function tabelaFaixas(m: Modelo) {
  const total = m.faixas_score.reduce((s, f) => s + f.conversoes, 0);
  let acum = 0;
  const linhas = m.faixas_score.map((f) => {
    acum += f.conversoes;
    return `<tr>
      <td class="nome">${f.faixa}</td>
      <td class="num">${num(f.volume)}</td>
      <td class="num">${num(f.conversoes)}</td>
      <td class="num">${p1(f.taxa_conversao)}</td>
      <td class="num">${p1(acum / total, 0)}</td>
    </tr>`;
  });
  return `<table>
    <thead><tr><th>Faixa</th><th class="num">Leads</th><th class="num">Vendas</th><th class="num">Conversão</th><th class="num">Vendas acum.</th></tr></thead>
    <tbody>${linhas.join("")}</tbody>
  </table>`;
}

function tabelaAB(d: Dados) {
  const met = [
    ["auc", "AUC"],
    ["ks", "KS"],
    ["recall_30", "Recall@30%"],
  ] as const;
  const conj = [
    ["treino", "Treino"],
    ["oos", "OOS"],
    ["oot", "OOT"],
  ] as const;
  const linhas = met.flatMap(([k, mn]) =>
    conj.map(([c, cn], i) => {
      const va = d.a.metricas[c][k];
      const vb = d.b.metricas[c][k];
      const dif = vb - va;
      return `<tr>
        <td class="nome">${i === 0 ? mn : ""}</td>
        <td>${cn}</td>
        <td class="num">${n3(va)}</td>
        <td class="num">${n3(vb)}</td>
        <td class="num ${dif >= 0 ? "pos" : "neg"}">${dif >= 0 ? "+" : "−"}${num(Math.abs(dif) * 100, 1)} p.p.</td>
      </tr>`;
    }),
  );
  return `<table>
    <thead><tr><th>Métrica</th><th>Conjunto</th><th class="num">A — baseline</th><th class="num">B — +campanha</th><th class="num">Δ</th></tr></thead>
    <tbody>${linhas.join("")}</tbody>
  </table>`;
}

export function documento(d: Dados): string {
  const b = d.base;
  const s = split(d);
  const oot = b.metricas.oot;
  const cortes = n.cortes(b);
  const drills = Object.fromEntries(b.drilldown.map((x) => [x.feature, x]));
  const acoes = n.acoes(d);

  const secoes = [
    "O ganho, em uma curva",
    "A base utilizada",
    "Como o modelo funciona",
    "Qualidade do modelo",
    "Faixas de score",
    "Quais variáveis pesam mais",
    "Zoom dentro de cada variável",
    "Experimento de mídia — o desenho",
    "Experimento de mídia — o resultado",
    "Plano de ação",
  ];

  /** Número da página de uma seção — evita referência cruzada errada ao reordenar. */
  const pg = (t: string) => secoes.indexOf(t) + 2;

  const avisoDoisModelos = `<div class="aviso">
    <span class="tag">Dois modelos independentes.</span>
    Este relatório cobre <strong>dois</strong> modelos que não devem ser comparados entre si.
    O <strong>modelo principal</strong> (páginas 2 a 8) treina na base inteira, com otimização de
    hiperparâmetros. O <strong>experimento de mídia</strong> (páginas 9 e 10) roda em
    ${p1(d.campanha.subconjunto.pct_da_base_limpa)} da base — só os leads com campanha atribuída —
    e sem otimização, porque o objetivo ali é isolar o efeito das colunas de campanha, não achar o
    melhor modelo possível. Dentro do experimento, A e B <em>são</em> comparáveis entre si.
  </div>`;

  return `
<div class="page capa">
  <div class="topo">
    <div class="logo"><span class="mark"></span>Volkswagen <span class="sub" style="white-space:nowrap">Lead Scoring</span></div>
  </div>

  <div>
    <div class="eyebrow">Modelo preditivo de conversão de leads · ${dia(b.dados.periodo.inicio)} a ${dia(b.dados.periodo.fim)}</div>
    <h1>${n.manchete(d)}</h1>
    <div class="rule"></div>
    <p class="lead" style="max-width:44em">${n.resumo(d)} ${n.vereditoMeta(d)}</p>
  </div>

  <div style="margin-top:8mm">
    <div class="row">
      ${kpi("AUC (OOT)", n3(oot.auc), "", "separação entre quem compra e quem não compra")}
      ${kpi("KS (OOT)", n3(oot.ks), "", "distância entre as duas distribuições de score")}
      ${kpi("Recall@30%", p1(oot.recall_30), "", "das vendas, ligando só para os 30% mais quentes")}
      ${kpi("Lift quente ÷ frio", num(lift(b.faixas_score), 1), "×", "faixa 1 contra faixa 10")}
    </div>
  </div>

  <div style="margin-top:6mm">${avisoDoisModelos}</div>

  <div class="indice">
    <div class="eyebrow" style="color:var(--muted-foreground)">Neste relatório</div>
    <ol>
      ${secoes.map((x, i) => `<li><span class="p">${i + 2}</span>${x}</li>`).join("")}
    </ol>
  </div>

  <div class="rodape small muted">
    Base: <code>${b.dados.arquivo_origem}</code> — ${num(b.dados.n_linhas)} leads e ${b.dados.n_colunas} colunas
    após limpeza, de ${dia(b.dados.periodo.inicio)} a ${dia(b.dados.periodo.fim)}.
    Conversão geral da base: ${p1(b.dados.taxa_conversao_geral)}. Modelo LightGBM.
    Exportado em ${dia(b.gerado_em)}.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[0]}</h2>
    <p class="muted">Percentual das vendas que o time captura contactando os leads do score mais quente para o mais frio. A diagonal é a discagem sem modelo.</p>
  </header>

  ${g.gGanhoBase(d, 468)}
  <figcaption>Conjunto OOT (teste no tempo). O ponto marcado é o corte de 30% da base — a métrica-meta do projeto.</figcaption>

  <section class="row" style="margin-top:6mm">
    ${cortes
      .map((c) =>
        kpi(
          `Ligando para ${p1(c.pctBase, 0)}`,
          p1(c.pctConv),
          "",
          `das vendas · ${num(c.pctConv / c.pctBase, 1)}× o aleatório`,
        ),
      )
      .join("")}
  </section>

  <div class="callout" style="margin-top:6mm">
    <span class="tag">Leitura:</span> ${n.vereditoMeta(d)}
    O modelo não decide nada sozinho — ele ordena a fila. O mesmo esforço de discagem
    passa a render mais porque os leads chegam ao vendedor na ordem certa.
  </div>

  <div class="callout" style="margin-top:4mm">
    <span class="tag">Por que não há gráfico de volume por faixa:</span> as faixas são decis,
    ou seja, contêm ${num(b.faixas_score[0]!.volume)} leads cada por construção. O volume aparece
    como coluna na tabela da página ${pg("Faixas de score")}, onde ele informa; como gráfico seria uma barra reta.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[1]}</h2>
    <p class="muted">Origem, período e colunas disponíveis depois do processamento.</p>
  </header>

  <section class="row">
    ${kpi("Leads na base limpa", num(b.dados.n_linhas / 1e6, 2), " Mi", `arquivo ${b.dados.arquivo_origem}`)}
    ${kpi("Colunas", String(b.dados.n_colunas), "", `${b.importancia_features.length} entraram no modelo com ganho positivo`)}
    ${kpi("Período", num((s.fim.getTime() - s.inicio.getTime()) / (365.25 * 86400000), 1), " anos", `${dia(b.dados.periodo.inicio)} a ${dia(b.dados.periodo.fim)}`)}
    ${kpi("Conversão geral", p1(b.dados.taxa_conversao_geral), "", "leads que viraram venda identificada")}
  </section>

  <section style="margin-top:6mm">
    <h3>Como o período foi dividido</h3>
    <p class="muted">O corte é sempre por data do lead, nunca aleatório: variáveis como a conversão
    recente da concessionária só existem de verdade se o histórico for cronológico. Um sorteio
    aleatório deixaria informação do futuro vazar para o treino.</p>
    ${g.gSplit(d, 205)}
    <figcaption>Maturação: os últimos 3 meses ficam fora do modelo — são leads recentes demais para
    terem tido tempo de converter, e incluí-los subestimaria a conversão real. O OOT são os 2 meses
    anteriores a esse corte (${dia(s.corteOot.toISOString())} a ${dia(s.corteMaturacao.toISOString())}), usados como teste
    no tempo. O resto é dev, dividido 80/20 em treino e OOS.</figcaption>
  </section>

  <section style="margin-top:5mm">
    <h3>Colunas disponíveis</h3>
    <table class="cols">
      <tbody>
        ${COLUNAS.map(
          (grp) => `<tr>
          <td style="width:52mm;vertical-align:top">
            <span class="nome">${grp.grupo}</span>
            <div class="small muted" style="line-height:1.4">${grp.nota}</div>
          </td>
          <td>${grp.itens.map((i) => `<code>${i}</code>`).join(" ")}</td>
        </tr>`,
        ).join("")}
      </tbody>
    </table>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[2]}</h2>
    <p class="muted">O necessário para ler as páginas seguintes, sem abrir os notebooks.</p>
  </header>

  <section class="row">
    <div class="card">
      <h3>O que ele prevê</h3>
      <p class="muted">Para cada lead, a <strong>probabilidade</strong> de virar venda — não um
      sim/não. É essa probabilidade que ordena quem o vendedor liga primeiro. O alvo aprendido é
      <code>TARGET_CONVERSAO</code>: 1 se houve venda identificada, 0 se não.</p>
    </div>
    <div class="card">
      <h3>O algoritmo</h3>
      <p class="muted">LightGBM, um conjunto de árvores de decisão treinadas em sequência, cada uma
      corrigindo o erro da anterior. Lida com colunas categóricas direto, sem transformar cada
      valor em uma coluna nova. Os hiperparâmetros vêm de 100 tentativas do Optuna otimizando AUC
      no conjunto OOS.</p>
    </div>
  </section>

  <section style="margin-top:5mm">
    <h3>As três métricas usadas neste relatório</h3>
    <table>
      <thead><tr><th style="width:32mm">Métrica</th><th>O que mede</th><th style="width:44mm">Como ler</th></tr></thead>
      <tbody>
        <tr><td class="nome">AUC-ROC</td><td>Chance de o modelo dar score maior a um lead que converteu do que a um que não converteu.</td><td class="muted">0,5 = sorteio · 1,0 = perfeito</td></tr>
        <tr><td class="nome">KS</td><td>Maior distância entre a distribuição de score de quem converteu e de quem não converteu.</td><td class="muted">Quanto maior, mais separadas as duas populações</td></tr>
        <tr><td class="nome">Recall@30%</td><td>Das vendas reais, quantas caem nos 30% de leads com maior score.</td><td class="muted">Métrica-meta do projeto: ≥ 60%</td></tr>
      </tbody>
    </table>
  </section>

  <section style="margin-top:5mm">
    <h3>Para que serve cada conjunto</h3>
    <table>
      <thead><tr><th style="width:32mm">Conjunto</th><th style="width:26mm">Recorte</th><th>Para que serve</th></tr></thead>
      <tbody>
        <tr><td class="nome">Treino</td><td class="muted">80% do dev</td><td>Onde o modelo aprende. Métrica alta aqui não prova nada sozinha.</td></tr>
        <tr><td class="nome">OOS</td><td class="muted">20% do dev</td><td>Validação sorteada dentro do mesmo período. É nele que o Optuna escolhe os hiperparâmetros.</td></tr>
        <tr><td class="nome">OOT</td><td class="muted">2 meses seguintes</td><td>Teste no tempo — simula o modelo já em produção. É a coluna que decide.</td></tr>
        <tr><td class="nome">Maturação</td><td class="muted">3 meses finais</td><td>Fora de tudo. Leads recentes demais para terem tido tempo de virar venda.</td></tr>
      </tbody>
    </table>
  </section>

  <section style="margin-top:5mm">
    <h3>Duas formas de olhar a importância — e por que as duas aparecem</h3>
    <div class="row">
      <div class="card">
        <h3>Importância por ganho</h3>
        <p class="muted">Quanto cada <em>coluna inteira</em> ajudou o modelo a separar convertidos
        de não convertidos. Responde "que variáveis pesam", nunca "qual valor delas é bom".
        É o gráfico da página ${pg("Quais variáveis pesam mais")}.</p>
      </div>
      <div class="card">
        <h3>Contribuição SHAP</h3>
        <p class="muted">Quanto cada <em>valor específico</em> empurra a probabilidade de um lead,
        lead a lead. Positivo puxa a conversão para cima, negativo para baixo. É o que permite o
        zoom da página ${pg("Zoom dentro de cada variável")}.</p>
      </div>
    </div>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Fora do modelo por decisão:</span> identificadores puros
    (<code>ID principal</code>, <code>DN</code>, <code>Versão</code>, <code>Satélite</code>) e campos de
    texto livre de altíssima cardinalidade (<code>Descrição do Veículo</code>,
    <code>DN - Nome Fantasia</code>) não entram como variável — o modelo decoraria o registro em vez
    de aprender o padrão. Eles ficam só para rastreabilidade e para os drill-downs.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[3]}</h2>
    <p class="muted">As três métricas nos três conjuntos. O que importa é a coluna OOT — é ela que simula o modelo já rodando em produção.</p>
  </header>

  ${g.gMetricas(b, 430)}
  <figcaption>Treino e OOS são passado em relação ao OOT. A linha vermelha é a meta contratada.</figcaption>

  <section class="row" style="margin-top:6mm">
    <div class="card">
      <h3>O modelo se sustenta no tempo</h3>
      <p class="muted">${n.estabilidade(b)}</p>
      <p class="muted">A diferença entre OOS (${n3(b.metricas.oos.auc)}) e OOT (${n3(b.metricas.oot.auc)})
      é ainda menor, o que indica que a queda vem da dificuldade natural de prever o futuro, não de
      instabilidade do modelo.</p>
    </div>
    <div class="card">
      <h3>${n.vereditoMeta(d).split(":")[0]}</h3>
      <p class="muted">${n.vereditoMeta(d).split(": ")[1]}</p>
      <p class="muted">O OOT tem ${num(b.faixas_score.reduce((x, f) => x + f.volume, 0))} leads de dois meses.
      Um recorte curto oscila; a leitura correta é acompanhar essa métrica mês a mês depois de subir,
      não tratar o número de um bimestre como definitivo.</p>
    </div>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Como isso vira decisão:</span> AUC e KS dizem se o modelo <em>separa</em>;
    Recall@30% diz quanto disso vira resultado dentro da capacidade real de atendimento do time.
    Se a capacidade de discagem mudar, o corte muda junto — a curva da página ${pg("O ganho, em uma curva")} mostra o resultado
    em qualquer corte, não só nos 30%.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[4]}</h2>
    <p class="muted">Os leads do OOT ordenados por score e cortados em dez faixas iguais. Faixa 1 = os 10% mais quentes.</p>
  </header>

  ${g.gFaixas(b, b.dados.taxa_conversao_geral, 412)}
  <figcaption>Taxa de conversão observada por faixa, conjunto OOT.</figcaption>

  <section class="row" style="margin-top:5mm">
    <figure>
      ${tabelaFaixas(b)}
      <figcaption>Volume é igual por construção — as faixas são decis.</figcaption>
    </figure>
    <div>
      <div class="card">
        <h3>O que a escada mostra</h3>
        <p class="muted">${n.liftFaixas(b)}</p>
        <p class="muted">A ordem das faixas é monotônica: cada faixa converte menos que a anterior.
        É esse comportamento, e não o valor absoluto do AUC, que torna o score utilizável como fila
        de atendimento.</p>
      </div>
      <div class="callout" style="margin-top:4mm">
        <span class="tag">Uso prático:</span> as faixas 1 a 3 concentram a maior parte das vendas e
        justificam contato humano imediato. Da faixa 7 para baixo, o custo de ligar dificilmente se
        paga — é onde automação e nutrição por e-mail substituem o vendedor.
      </div>
    </div>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[5]}</h2>
    <p class="muted">Participação de cada variável no ganho total do modelo, da maior para a menor.</p>
  </header>

  ${g.gImportancia(b, 482)}
  <figcaption>Importância por ganho (LightGBM). O rótulo à direita é o acumulado da variável para cima.</figcaption>

  <section class="row" style="margin-top:6mm">
    <div class="card">
      <h3>Poucas variáveis carregam o modelo</h3>
      <p class="muted">${n.concentracao(b)}</p>
    </div>
    <div class="card">
      <h3>O que isso diz do negócio</h3>
      <p class="muted">O topo da lista mistura três naturezas: histórico da concessionária,
      comportamento do lead (test drive, horário, troca) e o produto/canal de entrada. Nenhuma delas
      é dado cadastral do cliente — o que o modelo aprende é <em>contexto</em>, e contexto é
      acionável.</p>
    </div>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Cuidado de leitura:</span> importância não é causalidade. Que a conversão
    recente da concessionária pese muito não significa que forçar aquela DN a receber mais leads
    aumentaria a venda — significa que ela é o melhor sinal disponível hoje para prever o desfecho.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[6]}</h2>
    <p class="muted">Dentro de cada variável importante, quais valores empurram a conversão para cima e quais derrubam. Contribuição SHAP média, conjunto de treino.</p>
  </header>

  ${b.drilldown
    .map(
      (dd, i) => `<section style="margin-top:${i === 0 ? 0 : 5}mm">
    <h3>${rotulo(dd.feature)} · detalhe por ${dd.coluna_detalhe}</h3>
    ${g.gDrill(dd, dd.top_valores.length > 5 ? 196 : 108)}
  </section>`,
    )
    .join("")}

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Leitura:</span> ${n.drill(drills["Sub Origem"] ?? b.drilldown[0]!)}
  </div>

  <div class="callout alerta" style="margin-top:4mm">
    <span class="tag">Achado de cadastro:</span>
    ${n.cadastroRepetido(drills["FamilyProduct"] ?? b.drilldown[0]!)}
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[7]}</h2>
    <p class="muted">Um segundo modelo, treinado só onde existe atribuição de campanha, para responder uma pergunta específica.</p>
  </header>

  ${avisoDoisModelos}

  <section class="row" style="margin-top:5mm">
    ${kpi("Leads no experimento", num(d.campanha.subconjunto.n_linhas / 1000, 0), " mil", `${p1(d.campanha.subconjunto.pct_da_base_limpa)} da base limpa`)}
    ${kpi("Conversão do recorte", p1(d.campanha.subconjunto.taxa_conversao), "", `contra ${p1(b.dados.taxa_conversao_geral)} da base completa`)}
    ${kpi("Colunas testadas", String(COLS_CAMPANHA.length), "", "só o modelo B as enxerga")}
  </section>

  <section class="row" style="margin-top:5mm">
    <div class="card">
      <h3>A pergunta do experimento</h3>
      <p class="muted">Dois modelos treinados no <em>mesmo</em> recorte, com a <em>mesma</em>
      metodologia: <strong>A</strong> usa as variáveis de hoje; <strong>B</strong> usa as mesmas mais
      ${COLS_CAMPANHA.length} colunas de campanha de mídia. A diferença entre eles é o efeito das
      colunas novas — e nada além disso.</p>
      <p class="muted">${n.subconjunto(d)}</p>
    </div>
    <div class="card">
      <h3>As ${COLS_CAMPANHA.length} colunas testadas</h3>
      <p class="muted">${COLS_CAMPANHA.map((c) => rotulo(c)).join(" · ")}</p>
      <p class="muted">Descrevem por onde a mídia trouxe o lead: produto anunciado, segmento de
      audiência, publisher, formato do anúncio e etapa do funil.</p>
    </div>
  </section>

  <section style="margin-top:5mm">
    <h3>A e B lado a lado</h3>
    ${tabelaAB(d)}
    <figcaption>Comparação válida: mesmo recorte, mesma metodologia, sem otimização em nenhum dos dois.</figcaption>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[8]}</h2>
    <p class="muted">Mesma curva de ganho da página ${pg("O ganho, em uma curva")}, agora comparando os dois modelos do experimento.</p>
  </header>

  ${g.gGanhoAB(d, 342)}
  <figcaption>Conjunto OOT do recorte de campanha. O ponto marcado é o corte de 30%.</figcaption>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Veredito:</span> ${n.vereditoCampanha(d)}
  </div>

  <section style="margin-top:5mm">
    <h3>Onde as colunas de campanha entraram no modelo B</h3>
    ${g.gImportancia(d.b, 366, true)}
    <figcaption>Em azul-claro, as ${COLS_CAMPANHA.length} colunas que só o modelo B enxerga. ${n.pesoCampanha(d, COLS_CAMPANHA)}</figcaption>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[9]}</h2>
    <p class="muted">O que os dados deste relatório sustentam — e só isso. Não há estimativa financeira porque a base não traz valor de venda nem custo de contato.</p>
  </header>

  <table class="acao">
    <tbody>
      ${acoes
        .map(
          (a, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td>
          <h3>${a.titulo}</h3>
          <p class="muted">${a.texto}</p>
        </td>
        <td style="width:18mm;text-align:right;vertical-align:top">
          <span class="chip ${a.prioridade === "alta" ? "alta" : ""}">${a.prioridade}</span>
        </td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <section class="row" style="margin-top:6mm">
    <div class="card">
      <h3>O que este relatório não responde</h3>
      <p class="muted">Não há retorno em reais aqui. A base de leads não traz valor de venda nem
      custo de contato, então qualquer cifra seria invenção. Com ticket médio por modelo e custo
      por contato, a curva da página ${pg("O ganho, em uma curva")} vira estimativa financeira direta.</p>
      <p class="muted">Também não há teste causal: o modelo prevê, não explica. Saber que uma
      concessionária converte mais não diz que mandar mais leads para ela venderia mais.</p>
    </div>
    <div class="card">
      <h3>Como reproduzir</h3>
      <p class="muted">Os números deste relatório saem de dois arquivos exportados pelos notebooks
      de modelagem — <code>modelo_base.json</code> e <code>modelo_campanha.json</code> — sem nenhum
      recálculo aqui. Regerar o relatório com uma exportação nova atualiza texto, gráficos e
      vereditos juntos.</p>
      <p class="muted">Base <code>${b.dados.arquivo_origem}</code>, exportada em ${dia(b.gerado_em)}.</p>
    </div>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Próxima medição:</span> depois de subir o score, o número a acompanhar é o
    Recall@30% real — quantas das vendas do mês vieram dos 30% mais quentes daquele mês. Se ele
    ficar consistentemente abaixo do ${p1(b.metricas.oot.recall_30)} medido aqui, o modelo envelheceu
    e precisa de retreino.
  </div>
</div>`;
}
