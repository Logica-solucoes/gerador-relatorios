import type { Dados, Modelo } from "./queries";
import { COLUNAS, capturaEm, faixaExibida, lift, taxaConversaoEm, TAXA_ATENDIMENTO } from "./queries";
import { graficos as g, COLS_CAMPANHA, rotulo, split } from "./report";
import { num, pct, dt } from "../../core/report";
import * as n from "./narrativa";

export const titulo = "Volkswagen — Lead Scoring: relatório do modelo";

/** Meio-dia UTC: sem hora fixa, "2026-07-13" vira 12/07 no fuso de São Paulo. */
const dia = (s: string) => dt(s.slice(0, 10) + "T12:00:00Z");
const p1 = (v: number, d = 1) => pct(v * 100, d);
const n3 = (v: number) => num(v, 3);

/** KPI sem comparação temporal — aqui não há ano anterior, só o valor e o contexto. */
function kpi(label: string, valor: string, unidade: string, nota: string) {
  return `<div class="card kpi">
    <div class="label">${label}</div>
    <div class="value">${valor}<span class="unit">${unidade}</span></div>
    <div class="small muted" style="margin-top:1.5mm">${nota}</div>
  </div>`;
}

/**
 * Título de um bloco de drill-down. O recorte pode repetir a própria variável
 * (Família do veículo detalha nela mesma) — nesse caso o sufixo some em vez de
 * virar "Família do veículo · detalhe por Família do veículo".
 */
function tituloDrill(dd: Modelo["drilldown"][number]) {
  const base = rotulo(dd.feature);
  const partes = dd.coluna_detalhe
    .split("›")
    .map((s) => rotulo(s.trim()))
    .filter((s) => s !== base);
  return partes.length ? `${base} · detalhe por ${partes.join(" › ")}` : base;
}

function tabelaFaixas(m: Modelo) {
  const total = m.faixas_score.reduce((s, f) => s + f.conversoes, 0);
  let acum = 0;
  const linhas = m.faixas_score.map((f) => {
    acum += f.conversoes;
    return `<tr>
      <td class="nome">${faixaExibida(f.faixa)}</td>
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

/**
 * Termos técnicos que aparecem no relatório. Prosa neutra: definição não muda com
 * o export. Cabem **21 linhas** na página; acima disso o glossário parte em duas e
 * `pg()` passa a apontar errado (ver clients/vw/CLAUDE.md). Termo novo entrando,
 * termo velho saindo — ou a página vira duas e `pg()` muda junto.
 */
const GLOSSARIO = [
  ["Lead", "Um contato interessado que entrou pelo site, pela mídia ou pelo WhatsApp e virou registro no CRM."],
  ["Score", "A nota que o modelo dá a cada lead. É uma probabilidade de conversão entre 0 e 1, não um sim/não."],
  ["Faixa (decil)", "Os leads ordenados por score e cortados em dez grupos iguais. Faixa 10 = os 10% de maior score; faixa 1 = os 10% de menor."],
  ["Lift", "Quantas vezes uma faixa converte mais que outra. Lift 15× entre a faixa 10 e a 1 significa que a primeira converte quinze vezes mais."],
  ["Curva de ganho", "O gráfico que mostra quanto das vendas se alcança contactando cada fatia da base, do score mais quente para o mais frio."],
  ["Taxa de atendimento", "Quantos dos leads gerados chegam a receber contato. Medida pela auditoria de leads, não pelo modelo."],
  ["AUC (AUC-ROC)", "Chance de o modelo dar nota maior a um lead que converteu do que a um que não converteu. 0,5 é sorteio; 1,0 é perfeito."],
  ["KS", "Maior distância entre a distribuição de score de quem converteu e a de quem não converteu. Quanto maior, mais separadas as duas populações."],
  ["Recall@30%", "Das vendas reais, quantas caem nos 30% de leads com maior score."],
  ["p.p. (ponto percentual)", "A diferença entre dois percentuais. De 45% para 63% são 18 p.p. — não 18%."],
  ["Treino", "A parte do histórico onde o modelo aprende. Métrica alta aqui, sozinha, não prova nada."],
  ["OOS (out of sample)", "Validação sorteada dentro do mesmo período do treino. É nela que os hiperparâmetros são escolhidos."],
  ["OOT (out of time)", "Teste nos meses seguintes ao treino. Simula o modelo já rodando em produção — é a coluna que decide."],
  ["Maturação", "Os meses mais recentes, deixados fora de tudo: são leads novos demais para terem tido tempo de virar venda."],
  ["LightGBM", "O algoritmo usado: um conjunto de árvores de decisão treinadas em sequência, cada uma corrigindo o erro da anterior."],
  ["Importância por ganho", "Quanto uma coluna inteira ajudou o modelo a separar quem compra de quem não compra."],
  ["Contribuição SHAP", "Quanto um valor específico de uma coluna empurra a probabilidade de um lead, para cima ou para baixo."],
  ["Overfitting", "Quando o modelo decora o treino em vez de aprender o padrão — desempenho alto no passado que não se repete no futuro."],
  ["Drift", "O desgaste natural do modelo conforme o mercado muda. Obriga a reprocessar o score e a retreinar periodicamente."],
  ["Lookalike", "Audiência que as plataformas de mídia montam a partir de uma lista-semente, buscando perfis parecidos com ela."],
  ["Atribuição de mídia", "Conseguir dizer por qual campanha um lead entrou. Hoje existe só numa parte da base."],
];

export function documento(d: Dados): string {
  const b = d.base;
  const s = split(d);
  const oot = b.metricas.oot;
  const cortes = n.cortes(b);
  const drills = Object.fromEntries(b.drilldown.map((x) => [x.feature, x]));
  const acoes = n.acoes(d);
  const captura = capturaEm(b.faixas_score, TAXA_ATENDIMENTO);
  const taxaHoje = b.dados.taxa_conversao_geral;
  const taxaOrdenada = taxaConversaoEm(b.faixas_score, TAXA_ATENDIMENTO, taxaHoje);
  const grupos = n.grupos(b);
  const anos = (s.fim.getTime() - s.inicio.getTime()) / (365.25 * 86400000);

  const secoes = [
    "O que é o Lead Score",
    "Como o modelo funciona",
    "Como ler o score",
    "O ganho, em uma curva",
    "A base utilizada",
    "Metodologia e métricas",
    "Qualidade do modelo",
    "Faixas de score",
    "Quais variáveis pesam mais",
    "Zoom dentro de cada variável",
    "Experimento de mídia — o desenho",
    "Experimento de mídia — o resultado",
    "Plano de ação",
    "Glossário",
  ];

  /** Número da página de uma seção — evita referência cruzada errada ao reordenar. */
  const pg = (t: string) => secoes.indexOf(t) + 2;

  const avisoDoisModelos = `<div class="aviso">
    <span class="tag">Dois modelos independentes.</span>
    Este relatório cobre <strong>dois</strong> modelos que não devem ser comparados entre si.
    O <strong>modelo principal</strong> (páginas ${pg("O que é o Lead Score")} a ${pg("Zoom dentro de cada variável")}) treina na base inteira, com otimização de
    hiperparâmetros. O <strong>experimento de mídia</strong> (páginas ${pg("Experimento de mídia — o desenho")} e ${pg("Experimento de mídia — o resultado")}) roda em
    ${p1(d.campanha.subconjunto.pct_da_base_limpa)} da base — só os leads com campanha atribuída —
    e sem otimização, porque o objetivo ali é isolar o efeito das colunas de campanha, não achar o
    melhor modelo possível. Dentro do experimento, A e B <em>são</em> comparáveis entre si.
  </div>`;

  return `
<div class="page capa">
  <div class="topo">
    <div class="logo"><span class="mark"></span><span class="mark vw"></span>Volkswagen <span class="sub" style="white-space:nowrap">Lead Scoring</span></div>
  </div>

  <div>
    <div class="eyebrow">Modelo preditivo de conversão de leads · ${dia(b.dados.periodo.inicio)} a ${dia(b.dados.periodo.fim)}</div>
    <h1>${n.manchete(d)}</h1>
    <div class="rule"></div>
    <p class="lead" style="max-width:44em">${n.resumo(d)}</p>
  </div>

  <div style="margin-top:8mm">
    <div class="row">
      ${kpi("Leads atendidos hoje", p1(TAXA_ATENDIMENTO, 0), "", "taxa medida na auditoria de leads")}
      ${kpi("Vendas alcançadas", p1(captura), "", `no mesmo esforço, com a fila ordenada pelo score`)}
      ${kpi("AUC (OOT)", n3(oot.auc), "", "separação entre quem compra e quem não compra")}
      ${kpi("Lift quente ÷ frio", num(lift(b.faixas_score), 1), "×", "faixa 10 contra faixa 1")}
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
    <p class="muted">Antes de qualquer número: o que este modelo é, que pergunta ele responde e por que ele existe.</p>
  </header>

  <section class="row">
    <div class="card">
      <h3>O que é</h3>
      <p class="muted">Uma <strong>nota dada a cada lead</strong> assim que ele entra no CRM,
      calculada a partir do histórico de ${num(b.dados.n_linhas / 1e6, 2)} milhões de leads dos
      últimos ${num(anos, 1)} anos. Quanto maior a nota, maior a chance daquele lead virar venda.</p>
    </div>
    <div class="card">
      <h3>Que pergunta responde</h3>
      <p class="muted">Uma só: <em>se não dá para ligar para todo mundo, para quem eu ligo
      primeiro?</em> O modelo <strong>ordena a fila</strong>. Ele não escreve o discurso de venda,
      não define preço e não substitui o vendedor.</p>
    </div>
  </section>

  <section style="margin-top:6mm">
    <h3>O problema: a fila já é cortada — só não é cortada por critério</h3>
    <p class="muted">A capacidade de atendimento é menor que o volume de leads gerados, e isso não
    muda com este projeto. O que muda é <em>quem</em> fica dentro do corte. Enquanto a escolha for
    por ordem de chegada, atender ${p1(TAXA_ATENDIMENTO, 0)} dos leads alcança
    ${p1(TAXA_ATENDIMENTO, 0)} das vendas — é aritmética de sorteio, não desempenho.</p>
    <div class="row" style="margin-top:4mm">
      ${kpi("Taxa de atendimento", p1(TAXA_ATENDIMENTO, 0), "", "dos leads gerados recebem contato, conforme a auditoria de leads")}
      ${kpi("Ficam sem contato", p1(1 - TAXA_ATENDIMENTO, 0), "", "limite de capacidade do time, não escolha do modelo")}
      ${kpi("Vendas alcançadas hoje", p1(TAXA_ATENDIMENTO, 0), "", "fila por ordem de chegada: o resultado acompanha o esforço")}
      ${kpi("Vendas com a fila ordenada", p1(captura), "", "mesmo time, mesmo esforço, outra ordem")}
    </div>
    <div class="row" style="margin-top:3.5mm">
      ${kpi("Taxa de conversão hoje", p1(taxaHoje), "", "fila por ordem de chegada: mesma taxa da base inteira")}
      ${kpi("Taxa de conversão com fila ordenada", p1(taxaOrdenada), "", "contactando os mesmos leads, mas do score mais quente para o mais frio")}
    </div>
    <figcaption>${n.procedenciaCaptura(d)} A curva inteira, com esse corte marcado, está na página ${pg("O ganho, em uma curva")}.</figcaption>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">O ponto:</span> ${n.ganhoAtendimento(d)}
  </div>

  <section style="margin-top:5mm">
    <h3>Os benefícios de ter um modelo</h3>
    <table>
      <thead><tr><th style="width:46mm">Benefício</th><th>O que muda na prática</th></tr></thead>
      <tbody>
        <tr><td class="nome">Mais vendas, mesmo time</td><td>O ganho não vem de atender mais leads, vem de atender os leads certos dentro da mesma capacidade.</td></tr>
        <tr><td class="nome">Um critério só</td><td>Hoje a ordem depende de quem pegou o lead primeiro. O score aplica a mesma régua em toda a rede, e ela é auditável.</td></tr>
        <tr><td class="nome">Sinal para a mídia</td><td>As duas pontas do score viram audiência: quem converte alimenta lookalike, quem não converte vira exclusão — ver página ${pg("Plano de ação")}.</td></tr>
        <tr><td class="nome">Diagnóstico do CRM</td><td>Ao ranquear os campos, o modelo expõe onde o cadastro está furado — ver página ${pg("Zoom dentro de cada variável")}.</td></tr>
      </tbody>
    </table>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[1]}</h2>
    <p class="muted">Do lead que entra no CRM até a fila ordenada que chega ao vendedor, sem abrir nenhum notebook.</p>
  </header>

  <table class="acao passos">
    <tbody>
      <tr>
        <td class="n">1</td>
        <td><h3>O lead entra no CRM</h3>
        <p class="muted">Nada muda para quem preenche o formulário nem para quem cadastra. O modelo
        lê o registro que já existe hoje — não pede campo novo.</p></td>
      </tr>
      <tr>
        <td class="n">2</td>
        <td><h3>O modelo lê o contexto</h3>
        <p class="muted">${b.importancia_features.length} informações já disponíveis no registro: qual concessionária recebeu o
        lead e como ela vem convertendo, qual veículo interessa, por qual canal ele entrou, se
        houve test drive, se há veículo para troca e quantas vezes aquele cliente já apareceu.</p></td>
      </tr>
      <tr>
        <td class="n">3</td>
        <td><h3>Ele devolve uma probabilidade</h3>
        <p class="muted">Um número entre 0 e 1 para aquele lead específico. Para uso no dia a dia
        ele é convertido em <strong>faixa de 1 a 10</strong>, comparando o lead com todos os
        outros do período: faixa 10 são os 10% de maior nota.</p></td>
      </tr>
      <tr>
        <td class="n">4</td>
        <td><h3>A fila sai ordenada</h3>
        <p class="muted">O time ataca da faixa 10 para baixo. Como a nota depende de dados que mudam
        — a conversão recente da concessionária, por exemplo — o score precisa ser recalculado na
        mesma cadência em que esses dados são atualizados.</p></td>
      </tr>
    </tbody>
  </table>

  <section class="row" style="margin-top:5mm">
    <div class="card">
      <h3>O que ele olha</h3>
      <p class="muted"><strong>Contexto, não perfil.</strong> Histórico da concessionária,
      comportamento do lead (test drive, horário de entrada, intenção de troca), produto de
      interesse e canal de entrada. Nenhuma dessas informações é dado pessoal do cliente — e todas
      são acionáveis pelo time.</p>
    </div>
  </section>

  <section style="margin-top:5mm">
    <h3>O que muda em cada área</h3>
    <table>
      <thead><tr><th style="width:34mm">Área</th><th>O que muda no dia a dia</th></tr></thead>
      <tbody>
        <tr><td class="nome">Vendas</td><td>A fila chega ordenada em vez de por ordem de chegada. O mesmo tempo de discagem passa a ser gasto onde ele rende mais.</td></tr>
        <tr><td class="nome">Mídia</td><td>As duas pontas do score voltam para as plataformas como audiência: quem converte vira semente, quem não converte vira exclusão — página ${pg("Plano de ação")}.</td></tr>
        <tr><td class="nome">CRM e cadastro</td><td>Ao ranquear os campos, o modelo mostra quais estão mal preenchidos e quanto isso custa em sinal perdido — página ${pg("Zoom dentro de cada variável")}.</td></tr>
      </tbody>
    </table>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Ele aprende com o passado:</span> o modelo foi treinado em leads de
    ${dia(b.dados.periodo.inicio)} a ${dia(b.dados.periodo.fim)} e projeta esse padrão para frente.
    Isso funciona enquanto o mercado se parecer com esse período — por isso o plano de ação da
    página ${pg("Plano de ação")} inclui acompanhar o desempenho mês a mês, não só subir e esquecer.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[2]}</h2>
    <p class="muted">Como interpretar uma faixa, o que ela significa em conversão real e o que fazer com cada lead.</p>
  </header>

  <section>
    <h3>Exemplo de leitura</h3>
    <p class="muted">O modelo não olha uma variável por vez, mas dá para ver a direção de cada uma.
    A tabela mostra, dentro das três variáveis com detalhe disponível, qual valor mais empurra a
    conversão para cima e qual mais derruba. Um lead que combina valores da coluna do meio tende à
    faixa 10; um que combina os da direita, à faixa 1.</p>
    <table style="margin-top:3mm">
      <thead><tr><th style="width:44mm">Variável</th><th>Empurra para cima</th><th>Empurra para baixo</th></tr></thead>
      <tbody>
        ${b.drilldown
          .map((dd) => {
            const alto = dd.top_valores[0]!;
            const baixo = dd.top_valores[dd.top_valores.length - 1]!;
            return `<tr>
          <td class="nome">${rotulo(dd.feature)}</td>
          <td>${alto.valor} <span class="small muted">(${n3(alto.contribuicao_media)} · ${num(alto.volume)} leads)</span></td>
          <td>${baixo.valor} <span class="small muted">(${n3(baixo.contribuicao_media)} · ${num(baixo.volume)} leads)</span></td>
        </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    <figcaption>Contribuição SHAP média no conjunto de treino: positivo empurra a probabilidade
    para cima, negativo para baixo. O detalhe de cada variável está na página ${pg("Zoom dentro de cada variável")}.</figcaption>
  </section>

  <section style="margin-top:6mm">
    <h3>O que fazer com cada faixa</h3>
    <table>
      <thead><tr><th style="width:20mm">Faixas</th><th class="num" style="width:24mm">Conversão</th><th class="num" style="width:26mm">Das vendas</th><th>Tratamento</th></tr></thead>
      <tbody>
        ${grupos
          .map(
            (gr) => `<tr>
          <td class="nome">${gr.de} a ${gr.ate}</td>
          <td class="num">${p1(gr.taxa)}</td>
          <td class="num">${p1(gr.pctVendas, 0)}</td>
          <td class="muted">${gr.acao}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <figcaption>Conjunto OOT. "Das vendas" é quanto do total de vendas do período está naquele bloco de faixas.</figcaption>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Como ler uma taxa de conversão:</span> a faixa 10 converter
    ${p1(b.faixas_score[0]!.taxa_conversao)} não quer dizer que todo lead dela compra. Quer dizer
    que <strong>1 em cada ${num(1 / b.faixas_score[0]!.taxa_conversao, 0)}</strong> compra, contra
    1 em cada ${num(1 / b.faixas_score[b.faixas_score.length - 1]!.taxa_conversao, 0)} na faixa 1.
    É essa diferença que justifica tratar os dois grupos de formas diferentes.
  </div>

  <section style="margin-top:5mm">
    <h3>Quatro erros de leitura para evitar</h3>
    <table>
      <thead><tr><th style="width:58mm">O que se costuma concluir</th><th>Por que não se sustenta</th></tr></thead>
      <tbody>
        <tr><td class="nome">"Faixa 10 é venda garantida"</td><td>É a faixa de maior probabilidade, não de certeza. A maioria dos leads da faixa 10 também não compra — ela só perde bem menos que as outras.</td></tr>
        <tr><td class="nome">"Faixa 1 é lead ruim, pode descartar"</td><td>É lead com menor probabilidade <em>agora</em>. Ele continua na base e sobe de faixa quando o contexto mudar: um novo contato, um test drive agendado, outra oferta.</td></tr>
        <tr><td class="nome">"A concessionária que mais converte deveria receber mais leads"</td><td>O modelo prevê, não explica. Ela é o melhor sinal disponível para antecipar o desfecho, o que não quer dizer que ela seja a causa dele.</td></tr>
        <tr><td class="nome">"O score de um lead é fixo"</td><td>A nota é relativa aos demais leads do período e depende de dados que mudam. Recalculado, o mesmo lead pode trocar de faixa.</td></tr>
      </tbody>
    </table>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[3]}</h2>
    <p class="muted">Percentual das vendas que o time captura contactando os leads do score mais quente para o mais frio. A diagonal é a fila sem modelo.</p>
  </header>

  ${g.gGanhoBase(d, 452)}
  <figcaption>Conjunto OOT (teste no tempo). A linha vertical é a taxa de atendimento de
  ${p1(TAXA_ATENDIMENTO, 0)} medida na auditoria; a seta é o que se ganha nesse mesmo corte só por
  mudar a ordem da fila. ${n.procedenciaCaptura(d)}</figcaption>

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
    <span class="tag">Leitura:</span> ${n.naoAtendidos(d)}
  </div>

  <div class="callout" style="margin-top:4mm">
    <span class="tag">Por que não há gráfico de volume por faixa:</span> as faixas são decis,
    ou seja, contêm ${num(b.faixas_score[0]!.volume)} leads cada por construção. O volume aparece
    como coluna na tabela da página ${pg("Faixas de score")}, onde ele informa; como gráfico seria uma barra reta.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[4]}</h2>
    <p class="muted">Origem, período e colunas disponíveis depois do processamento.</p>
  </header>

  <section class="row">
    ${kpi("Leads na base limpa", num(b.dados.n_linhas / 1e6, 2), " Mi", `arquivo ${b.dados.arquivo_origem}`)}
    ${kpi("Colunas", String(b.dados.n_colunas), "", `${b.importancia_features.length} entraram no modelo com ganho positivo`)}
    ${kpi("Período", num(anos, 1), " anos", `${dia(b.dados.periodo.inicio)} a ${dia(b.dados.periodo.fim)}`)}
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
    <h2>${secoes[5]}</h2>
    <p class="muted">O necessário para ler as páginas seguintes. Os termos estão definidos no glossário da página ${pg("Glossário")}.</p>
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
        <tr><td class="nome">Recall@30%</td><td>Das vendas reais, quantas caem nos 30% de leads com maior score.</td><td class="muted">Métrica de referência de mercado para comparar modelos</td></tr>
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
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[6]}</h2>
    <p class="muted">As três métricas nos três conjuntos. O que importa é a coluna OOT — é ela que simula o modelo já rodando em produção.</p>
  </header>

  ${g.gMetricas(b, 430)}
  <figcaption>Treino e OOS são passado em relação ao OOT.</figcaption>

  <section class="row" style="margin-top:6mm">
    <div class="card">
      <h3>${n.tituloEstabilidade(b)}</h3>
      <p class="muted">${n.estabilidade(b)}</p>
      <p class="muted">${n.estabilidadeOosOot(b)}</p>
    </div>
    <div class="card">
      <h3>Um bimestre não é um veredito</h3>
      <p class="muted">O OOT tem ${num(b.faixas_score.reduce((x, f) => x + f.volume, 0))} leads de dois meses.
      Um recorte curto oscila; a leitura correta é acompanhar as métricas mês a mês depois de subir,
      não tratar o número de um bimestre como definitivo.</p>
      <p class="muted">É por isso que este relatório não aponta um alvo a bater: ele mostra onde o
      modelo chega hoje e contra o que esse número deve ser comparado amanhã.</p>
    </div>
  </section>

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Como isso vira decisão:</span> AUC e KS dizem se o modelo <em>separa</em>;
    o Recall diz quanto disso vira resultado dentro da capacidade real de atendimento do time.
    Se a capacidade de discagem mudar, o corte muda junto — a curva da página ${pg("O ganho, em uma curva")} mostra o resultado
    em qualquer corte, não só nos ${p1(TAXA_ATENDIMENTO, 0)} de hoje.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[7]}</h2>
    <p class="muted">Os leads do OOT ordenados por score e cortados em dez faixas iguais. Faixa 10 = os 10% mais quentes.</p>
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
        <span class="tag">Uso prático:</span> as faixas 8 a 10 concentram
        ${p1(grupos[0]!.pctVendas, 0)} das vendas e justificam contato humano imediato. Da faixa 4
        para baixo, o custo de ligar dificilmente se paga — é onde automação e nutrição por e-mail
        substituem o vendedor. O tratamento por faixa está na página ${pg("Como ler o score")}.
      </div>
    </div>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[8]}</h2>
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
    <h2>${secoes[9]}</h2>
    <p class="muted">Dentro de cada variável importante, quais valores empurram a conversão para cima e quais derrubam. Contribuição SHAP média, conjunto de treino. Cada bloco traz os melhores e os piores valores, e só entram os que têm pelo menos ${num(b.drilldown[0]!.piso_volume)} leads — sem esse piso, a média de um único lead disputaria o topo com a de dezenas de milhares.</p>
  </header>

  ${b.drilldown
    .map(
      (dd, i) => `<section style="margin-top:${i === 0 ? 0 : 5}mm">
    <h3>${tituloDrill(dd)}</h3>
    ${g.gDrill(dd, dd.top_valores.length > 5 ? 182 : 100)}
  </section>`,
    )
    .join("")}

  <div class="callout" style="margin-top:5mm">
    <span class="tag">Leitura:</span> ${n.drill(drills["DN grupo"] ?? b.drilldown[0]!)}
  </div>

  <div class="callout alerta" style="margin-top:4mm">
    <span class="tag">Achado de cadastro:</span>
    ${b.drilldown.map((dd) => n.valorSuspeito(dd)).find(Boolean) ?? "Nenhum valor dos recortes acima é código cru ou ausência de cadastro — o preenchimento está consistente neste corte."}
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[10]}</h2>
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
    <h2>${secoes[11]}</h2>
    <p class="muted">Mesma curva de ganho da página ${pg("O ganho, em uma curva")}, agora comparando os dois modelos do experimento.</p>
  </header>

  ${g.gGanhoAB(d, 342)}
  <figcaption>Conjunto OOT do recorte de campanha. O ponto marcado é o corte de 30%, o mesmo da tabela A vs B da página anterior.</figcaption>

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
    <h2>${secoes[12]}</h2>
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
    <span class="tag">Próxima medição:</span> depois de subir o score, o número a acompanhar é a
    cobertura real de vendas no corte de atendimento — quantas das vendas do mês vieram dos
    ${p1(TAXA_ATENDIMENTO, 0)} de leads efetivamente contactados naquele mês. Se ela ficar
    consistentemente abaixo dos ${p1(captura)} medidos aqui, o modelo envelheceu e precisa de retreino.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[13]}</h2>
    <p class="muted">Os termos técnicos que aparecem neste relatório, em ordem de leitura: primeiro o vocabulário do lead, depois o das métricas, depois o do modelo.</p>
  </header>

  <table class="glos">
    <tbody>
      ${GLOSSARIO.map(
        ([termo, def]) => `<tr>
        <td class="nome" style="width:44mm;vertical-align:top">${termo}</td>
        <td class="muted">${def}</td>
      </tr>`,
      ).join("")}
    </tbody>
  </table>
</div>`;
}
