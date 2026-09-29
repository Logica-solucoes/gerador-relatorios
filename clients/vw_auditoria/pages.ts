import type { Dados } from "./queries";
import { PISO_AMOSTRA, TICKET_MEDIO } from "./queries";
import { graficos as g, COR, STATUS, CANAIS, FAIXA_NPS, legenda, amostra } from "./report";
import { num, pct, dt, mi } from "../../core/report";
import * as n from "./narrativa";

export const titulo = "Volkswagen — Auditoria de Leads: como ler os dados";

/** Meio-dia UTC: sem hora fixa, "2026-06-01" vira 31/05 no fuso de São Paulo. */
const dia = (s: string) => dt(s.slice(0, 10) + "T12:00:00Z");

function kpi(label: string, valor: string, unidade: string, nota: string) {
  return `<div class="card kpi">
    <div class="label">${label}</div>
    <div class="value">${valor}<span class="unit">${unidade}</span></div>
    <div class="small muted" style="margin-top:1.5mm">${nota}</div>
  </div>`;
}

/** O bloco que dá nome ao relatório: o que o gráfico mostra e como se lê. */
const comoLer = (texto: string) => `<div class="callout"><span class="tag">Como ler.</span> ${texto}</div>`;

/** O que os dados desta página dizem — sempre derivado, nunca escrito à mão. */
const achado = (texto: string) => `<div class="callout achado"><span class="tag">O que aparece aqui.</span> ${texto}</div>`;

/** Ressalva de leitura. Vermelha porque é onde o gráfico engana se lido rápido. */
const cuidado = (texto: string) => `<div class="callout alerta"><span class="tag">Cuidado.</span> ${texto}</div>`;

const perguntas = [
  ["Este é o telefone de fulano?", "Telefone válido", "Confirma se o cadastro do lead serve para alguma coisa. Cadastro errado não é falha de atendimento — é falha de captação."],
  ["A concessionária entrou em contato com você?", "Taxa de contato", "A pergunta mais importante da auditoria. É a única fonte que mede atendimento pela boca do cliente, e não pelo registro do vendedor."],
  ["Em quanto tempo entraram em contato?", "Tempo de resposta", "Quatro faixas: até 30 minutos, até duas horas, até um dia, mais de um dia."],
  ["Por qual canal falaram com você?", "Canal de contato", "WhatsApp, ligação ou e-mail."],
  ["Você preencheu o formulário na concessionária?", "Confirmação de preenchimento", "Marca quem chegou a entrar no fluxo formal da loja."],
  ["De 0 a 10, quanto você recomendaria?", "NPS", "A nota de satisfação com o atendimento recebido."],
  ["O que aconteceu depois?", "Distribuição de status", "Comprou VW zero, seminovo, comprou de outra marca, desistiu, não foi à loja."],
  ["Podemos retomar o contato?", "Leads recuperáveis", "Separa quem ainda está na jornada de compra e aceita ser procurado de novo."],
  ["Quer comentar alguma coisa?", "Sentimento e palavras", "Campo aberto. Uma IA classifica o texto em positivo, neutro ou negativo e extrai as palavras que carregam sentido."],
  ["Qual carro você comprou?", "Concorrência", "Só para quem respondeu que comprou de outra marca. Uma IA separa marca e modelo do texto livre."],
];

const GLOSSARIO = [
  ["Lead", "Um contato interessado que entrou pelo site, pela mídia ou pelo WhatsApp e virou registro no CRM."],
  ["Auditoria de leads", "A pesquisa que liga ou manda mensagem para o cliente depois do lead, para saber o que a concessionária de fato fez."],
  ["Lead auditado", "Lead cujo cliente respondeu pelo menos uma pergunta da auditoria. Quem não atendeu não é auditado."],
  ["Taxa de contato", "Dos clientes que responderam à pergunta, quantos confirmam que a concessionária os procurou."],
  ["Amostra (n)", "Quantas respostas sustentam aquele número. Aparece colada em cada barra deste relatório."],
  ["NPS", "Percentual de promotores menos percentual de detratores. Vai de −100 a +100 e não é uma média de notas."],
  ["Promotor", "Cliente que deu nota 9 ou 10."],
  ["Neutro", "Cliente que deu nota 7 ou 8. Não entra na conta do NPS."],
  ["Detrator", "Cliente que deu nota de 0 a 6."],
  ["p.p. (ponto percentual)", "A diferença entre dois percentuais. De 30% para 50% são 20 p.p. — não 20%."],
  ["DN", "O código da concessionária no cadastro da Volkswagen. Cada DN é uma loja."],
  ["Regional", "O agrupamento geográfico de concessionárias, numerado de 1 a 6."],
  ["Sub-origem", "De onde o lead veio: Site Ofertas, WhatsApp, Mercado Livre, Vendas Corporativas e assim por diante."],
  ["Base disponível para auditoria", "Os leads criados até 15 dias atrás. Leads mais novos ainda não tiveram tempo de ser contatados."],
  ["Venda identificada", "Lead que a base marcou como convertido, por flag de venda ou por data de faturamento."],
  ["Vendas perdidas", "Estimativa do dashboard: conversão da base aplicada sobre quem disse não ter sido contatado, somada a quem declarou compra na concorrência."],
];

export function documento(d: Dados): string {
  const k = d.kpis;
  const secoes = [
    "O que é a auditoria de leads",
    "As perguntas que o cliente responde",
    `De ${num(k.leadsCriados / 1000, 0)} mil leads a ${num(k.nContato)} respostas`,
    "Os cartões do topo do dashboard",
    "A taxa de contato",
    "Projeção da taxa de conversão",
    "Quando o gráfico engana: amostra pequena",
    "Como ler o NPS",
    "Velocidade de resposta e satisfação",
    "Velocidade de resposta e desfecho",
    "O que aconteceu com o lead",
    "O canal pedido e o canal usado",
    "Regionais",
    "Modelos",
    "Concessionárias",
    "De onde vêm os leads",
    "Vendas perdidas: como o número é feito",
    "A voz do cliente",
    "Concorrência: os primeiros sinais",
    "Glossário",
  ];
  /** Número da página de uma seção — evita referência cruzada errada ao reordenar. */
  const pg = (t: string) => secoes.indexOf(t) + 2;

  const legStatus = legenda(STATUS.map((s) => ({ rotulo: s.status, cor: s.cor })));
  const legCanal = legenda(CANAIS.map((c) => ({ rotulo: c.canal, cor: c.cor })));
  const legNps = legenda(FAIXA_NPS.map((f) => ({ rotulo: `${f.faixa} (${f.notas})`, cor: f.cor })));
  const legSent = legenda([
    { rotulo: "Positivo", cor: COR.accent },
    { rotulo: "Neutro", cor: COR.grey },
    { rotulo: "Negativo", cor: COR.red },
  ]);

  const tabelaDn = (linhas: Dados["tabelaDn"]) =>
    `<table>
      <thead><tr><th>Concessionária · DN</th><th>Grupo</th><th class="num">Respostas</th><th class="num">Taxa de contato</th><th class="num">Compraram outra marca</th></tr></thead>
      <tbody>${linhas
        .map(
          (x) => `<tr>
        <td class="nome">${x.nome} <span class="muted" style="font-weight:400">· ${x.dn}</span></td>
        <td class="muted">${x.grupo}</td>
        <td class="num">${num(x.nContato)}</td>
        <td class="num">${pct(x.txContato)}</td>
        <td class="num">${num(x.concorrencia)}</td>
      </tr>`,
        )
        .join("")}</tbody>
    </table>`;

  return `
<div class="page capa">
  <div class="topo">
    <div class="logo"><span class="mark"></span><span class="mark vw"></span>Volkswagen <span class="sub" style="white-space:nowrap">Auditoria de Leads</span></div>
  </div>

  <div>
    <div class="eyebrow">Como ler os dados da auditoria · ${n.periodo(d)}</div>
    <h1>O que os clientes respondem quando a gente pergunta se a concessionária ligou</h1>
    <div class="rule"></div>
    <p class="lead" style="max-width:44em">${n.subtituloCapa(d)}</p>
  </div>

  <div style="margin-top:7mm">
    <div class="row">
      ${kpi("Leads no período", num(k.leadsCriados), "", `criados entre ${n.periodo(d)}`)}
      ${kpi("Ouvidos pela auditoria", num(d.funil[3]!.n), "", `responderam pelo menos uma pergunta`)}
      ${kpi("Confirmam contato", pct(k.txContato), "", `de ${num(k.nContato)} respostas à pergunta`)}
      ${kpi("NPS geral", num(k.npsGeral, 1), "", `de ${num(k.nNps)} avaliações`)}
    </div>
  </div>

  <div style="margin-top:6mm">
    <div class="callout"><span class="tag">Para que serve este documento.</span>
    Ele não é um relatório de resultado — é um manual de leitura. Cada página traz um gráfico do
    dashboard da auditoria, explica <em>o que ele mostra</em>, <em>como se lê</em> e
    <em>onde ele engana</em>. Os números são reais e do período acima, mas o objetivo é você sair
    daqui sabendo abrir o dashboard sozinho.</div>
  </div>

  <div class="indice">
    <div class="eyebrow" style="color:var(--muted-foreground)">Neste relatório</div>
    <ol>
      ${secoes.map((x, i) => `<li><span class="p">${i + 2}</span>${x}</li>`).join("")}
    </ol>
  </div>

  <div class="rodape small muted">
    Fonte: base <code>LogicaChatBot</code> — leads criados de ${dia(d.periodo.inicio)} a
    ${dia(d.periodo.fim)}, cruzados com as respostas da auditoria. Os cartões de volume e conversão
    usam a base disponível para auditoria (até ${dia(d.periodo.fimDisponivel)}), como no dashboard.
  </div>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[0]}</h2>
    <p class="muted">Antes de qualquer gráfico: quem é perguntado, quem responde e por que isso é
    diferente de tudo o que já existe no CRM.</p>
  </header>

  <section class="row">
    <div class="card">
      <h3>O que é</h3>
      <p class="muted">Uma pesquisa que procura <strong>o cliente</strong> alguns dias depois de ele
      virar lead e pergunta o que a concessionária fez. Não é relatório de vendedor, não é registro
      de CRM: é a versão do cliente.</p>
    </div>
    <div class="card">
      <h3>Por que ela existe</h3>
      <p class="muted">Porque o CRM registra o que a loja <em>diz</em> ter feito. A auditoria mede o
      que o cliente <em>percebeu</em> — e as duas versões não batem. Onde não batem é exatamente
      onde há o que corrigir.</p>
    </div>
    <div class="card">
      <h3>O que ela não é</h3>
      <p class="muted">Não é censo. Fala com uma fração dos leads, e só uma parte dela responde.
      Serve para medir tendência e comparar grupos grandes — não para julgar um vendedor
      específico.</p>
    </div>
  </section>

  <section style="margin-top:6mm">
    <h3>O caminho, do lead até o número no dashboard</h3>
    <div class="fluxo">
      <div class="passo"><span class="n">1</span><strong>O lead entra</strong><p class="small muted">Alguém preenche um formulário no site, responde um anúncio ou chama no WhatsApp. Vira registro no CRM e é distribuído para uma concessionária.</p></div>
      <div class="passo"><span class="n">2</span><strong>A concessionária deveria ligar</strong><p class="small muted">Esse é o passo que a auditoria existe para verificar. Ele acontece fora da vista da Volkswagen.</p></div>
      <div class="passo"><span class="n">3</span><strong>A auditoria procura o cliente</strong><p class="small muted">Dias depois, uma mensagem chega ao cliente com as perguntas da página seguinte. Responder é opcional.</p></div>
      <div class="passo"><span class="n">4</span><strong>As respostas viram gráfico</strong><p class="small muted">Cada pergunta alimenta um número do dashboard. É esse caminho que este relatório destrincha.</p></div>
    </div>
  </section>

  <section style="margin-top:5mm">
    <h3>Quem responde — e por que isso importa</h3>
    <div class="row" style="margin-top:3mm">
      <div class="card">
        <h3>Responder é voluntário</h3>
        <p class="small muted">Ninguém é obrigado. Quem teve uma experiência marcante — muito boa ou
        muito ruim — tende a responder mais que quem teve uma experiência morna. É por isso que a
        página ${pg("Como ler o NPS")} mostra as notas concentradas nos extremos.</p>
      </div>
      <div class="card">
        <h3>Ninguém responde tudo</h3>
        <p class="small muted">A pesquisa não trava: o cliente pode parar em qualquer pergunta. Dos
        ${num(d.funil[3]!.n)} que responderam alguma coisa, ${num(d.funil[4]!.n)} chegaram à
        pergunta sobre contato e ${num(k.nNps)} até o NPS.</p>
      </div>
      <div class="card">
        <h3>O que isso não estraga</h3>
        <p class="small muted">Comparações. Se o viés de quem responde é parecido entre regionais,
        entre meses e entre faixas de tempo, a <em>diferença</em> entre eles continua confiável —
        mesmo que o nível absoluto não seja um retrato exato da base.</p>
      </div>
    </div>
  </section>

  <section style="margin-top:5mm">
    ${comoLer(`Toda vez que este relatório disser “os clientes ouvidos”, leia
    “os ${num(d.funil[3]!.n)} clientes que responderam à auditoria neste período” — nunca
    “os ${num(k.leadsCriados)} leads”. A diferença entre esses dois números é o assunto da
    página ${pg("De 125 mil leads a 1.200 respostas")}.`)}
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[1]}</h2>
    <p class="muted">Dez perguntas. Cada uma vira um número ou um gráfico do dashboard — e nenhum
    número existe sem que alguém tenha respondido a pergunta correspondente.</p>
  </header>

  <table class="perguntas">
    <thead><tr><th>O que o cliente é perguntado</th><th>Vira no dashboard</th><th>Para que serve</th></tr></thead>
    <tbody>
      ${perguntas
        .map(
          ([p, m, s]) =>
            `<tr><td class="nome">“${p}”</td><td><strong>${m}</strong></td><td class="muted small">${s}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <section style="margin-top:5mm">
    ${cuidado(`As perguntas são independentes. Um cliente pode responder “sim, entraram em contato”
    e abandonar antes do NPS. Por isso cada gráfico tem um <strong>n</strong> diferente, e por isso
    somar percentuais de gráficos diferentes não funciona.`)}
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[2]}</h2>
    <p class="muted">O funil da auditoria. Cada degrau é uma perda legítima de amostra — entender
    onde ela acontece é o que impede de ler os percentuais como se valessem para a base inteira.</p>
  </header>

  ${g.gFunil(d, 384)}

  ${comoLer(`A barra <strong>não</strong> é o volume: é quanto sobrou do degrau imediatamente
  acima. Se fosse volume, ${num(d.funil[5]!.n)} ao lado de ${num(
    d.funil[0]!.n,
  )} viraria um traço invisível. Barra curta = perda grande naquele passo; o volume absoluto e a
  fração do topo vêm no texto ao lado.`)}

  ${achado(n.resumoFunil(d))}

  <section style="margin-top:5mm">
    <div class="row">
      <div class="card">
        <h3>Por que só ${pct((d.funil[1]!.n / d.funil[0]!.n) * 100)} são abordados</h3>
        <p class="small muted">A auditoria tem capacidade limitada e trabalha por amostragem. Não é
        falha: é desenho. O que importa é que a amostra não seja enviesada por regional ou modelo.</p>
      </div>
      <div class="card">
        <h3>Por que ${num(d.funil[3]!.n - d.funil[4]!.n)} param no meio</h3>
        <p class="small muted">São clientes que começaram a responder e abandonaram antes da pergunta
        sobre contato. Responder é voluntário, e a pesquisa não trava em nenhuma pergunta.</p>
      </div>
      <div class="card">
        <h3>O que sobra é confiável?</h3>
        <p class="small muted">Para o número geral e para cortes grandes (regional, mês), sim. Para
        uma concessionária específica, quase nunca — é o assunto da
        página ${pg("Concessionárias")}.</p>
      </div>
    </div>
  </section>

  ${achado(n.alcanceAuditoria(d))}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[3]}</h2>
    <p class="muted">Os cartões que abrem o dashboard, com a base de cada um explicitada. Nenhum
    deles é calculado sobre o mesmo conjunto de leads.</p>
  </header>

  <section>
    <h3>Volume e conversão — base disponível para auditoria</h3>
    <div class="row" style="margin-top:3mm">
      ${kpi("Leads", num(k.leadsDisponiveis), "", `criados até ${dia(d.periodo.fimDisponivel)}`)}
      ${kpi("Vendas", num(k.vendas), "", "venda identificada ou faturada")}
      ${kpi("Conversão", pct(k.txVendas), "", "vendas ÷ leads")}
      ${kpi("Leads auditados", pct(k.txAbordados), "", `${num(k.abordados)} abordados pela auditoria`)}
    </div>
    <p class="small muted" style="margin-top:2.5mm">Estes quatro cartões cortam os últimos
    ${d.periodo.diasLag} dias: um lead de ontem ainda não teve tempo de ser contatado, e contá-lo
    derrubaria a conversão sem que nada tivesse acontecido de errado.</p>
  </section>

  <section style="margin-top:5mm">
    <h3>Resultado da auditoria — só quem respondeu</h3>
    <div class="row" style="margin-top:3mm">
      ${kpi("Telefone válido", pct(k.txTelValidos), "", `${num(k.telValidos)} cadastros conferidos`)}
      ${kpi("Taxa de contato", pct(k.txContato), "", `${amostra(k.nContato)} respostas`)}
      ${kpi("Preencheu formulário", pct(k.txPreencheu), "", `${amostra(k.nPreencheu)} respostas`)}
      ${kpi("Contato por WhatsApp", pct(k.txWpp), "", `${amostra(k.nWpp)} contatos`)}
    </div>
    <div class="row" style="margin-top:3mm">
      ${kpi("NPS geral", num(k.npsGeral, 1), "", `${amostra(k.nNps)} avaliações`)}
      ${kpi("Leads recuperáveis", num(k.leadsRecuperar), "", "aceitam ser procurados de novo")}
      ${kpi("Vendas recuperadas", num(k.vendasRecuperadas), "", "dos recuperáveis que viraram venda")}
      ${kpi("Vendas perdidas", num(k.perdasTotal), "", `estimativa — ver página ${pg("Vendas perdidas: como o número é feito")}`)}
    </div>
  </section>

  ${comoLer(`Os quatro cartões de cima falam da <strong>base</strong>; os oito de baixo falam da
  <strong>amostra</strong>. Um cartão de percentual sem o <strong>n</strong> ao lado é um número
  incompleto — no dashboard esse n aparece ao passar o mouse sobre o cartão.`)}

  <section style="margin-top:4mm">
    <h3>Qual cartão responde qual pergunta</h3>
    <table class="cartoes">
      <tbody>
        <tr><td class="nome">“Quantos leads o marketing entregou?”</td><td><strong>Leads</strong> — base, não amostra.</td></tr>
        <tr><td class="nome">“A rede está atendendo?”</td><td><strong>Taxa de contato</strong> — a resposta mais direta da auditoria.</td></tr>
        <tr><td class="nome">“O cadastro que geramos presta?”</td><td><strong>Telefone válido</strong> — mede captação, não atendimento.</td></tr>
        <tr><td class="nome">“Ainda dá para recuperar alguém?”</td><td><strong>Leads recuperáveis</strong> — quem autorizou novo contato.</td></tr>
      </tbody>
    </table>
  </section>

  ${cuidado(`Não multiplique um percentual da amostra pelo volume da base. “${pct(
    k.txContato,
  )} de ${num(k.leadsCriados)} leads” não é uma conta válida: a taxa de contato foi medida sobre
  ${num(k.nContato)} respostas, e quem responde à auditoria não é um sorteio perfeito da base.`)}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[4]}</h2>
    <p class="muted">O número central da auditoria: dos clientes que responderam, quantos confirmam
    que a concessionária os procurou.</p>
  </header>

  ${achado(n.vereditoContato(d))}

  <h3 style="margin-top:5mm">Evolução mês a mês</h3>
  ${g.gContatoMes(d, 322)}

  ${comoLer(`Cada ponto é um mês de <strong>criação do lead</strong>, não de resposta da auditoria.
  Um lead criado em junho e auditado em agosto conta em junho — é assim que o dashboard trata a
  data em todos os gráficos, e é o que permite comparar o mês com o volume de leads daquele mês.`)}

  ${achado(n.tendenciaContato(d))}

  ${cuidado(`O mês corrente sempre aparece com poucas respostas: a auditoria leva dias para
  alcançar o cliente. Ele vai se mover até fechar. Compare meses fechados entre si.`)}

  <section style="margin-top:5mm">
    <h3>O que faz essa taxa se mexer</h3>
    <div class="row" style="margin-top:3mm">
      <div class="card">
        <h3>A rede atendendo mais</h3>
        <p class="small muted">O motivo que todo mundo assume. É real, mas é só um dos três — e
        nunca o único a se mover num mês.</p>
      </div>
      <div class="card">
        <h3>Quem responde mudando</h3>
        <p class="small muted">Se num mês responderem sobretudo clientes irritados, a taxa cai sem
        que a rede tenha mudado nada. Por isso o <em>n</em> anda junto com a taxa.</p>
      </div>
      <div class="card">
        <h3>O mix de leads mudando</h3>
        <p class="small muted">Origens diferentes têm taxas de contato diferentes
        (página ${pg("De onde vêm os leads")}). Uma campanha grande num canal desloca a média
        nacional sozinha.</p>
      </div>
    </div>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[5]}</h2>
    <p class="muted">E se a mesma capacidade de contato de hoje fosse usada para ligar do score mais
    quente para o mais frio, em vez de por ordem de chegada?</p>
  </header>

  ${g.gProjecao(d, 300)}
  <figcaption>Taxa de conversão acumulada ao contactar os N% de maior score. A curva é a do modelo de
  Lead Scoring, ancorada na conversão real desta auditoria (${pct(d.projecao.taxaHoje * 100)}).</figcaption>

  <section class="row" style="margin-top:5mm">
    ${kpi("Conversão hoje", pct(d.projecao.taxaHoje * 100), "", "fila por ordem de chegada, em qualquer corte")}
    ${kpi("Conversão pelo score", pct(d.projecao.taxaOrdenada * 100), "", `nos mesmos ${pct(d.projecao.corte * 100, 0)} de leads contactados`)}
    ${kpi("Vendas a mais", "+" + num(d.projecao.vendasExtras, 0), "", `${num(d.projecao.mult, 2)}× o volume de hoje, no período disponível`)}
  </section>

  ${comoLer(`O nível da curva (onde ela pousa) vem da conversão real desta auditoria. A forma dela — o
  quanto o topo do score converte mais que o fundo — vem emprestada do modelo de Lead Scoring, que
  não é medido nestes dados. É por isso que o gráfico tem duas fontes, e a legenda diz as duas.`)}

  ${achado(n.projecaoVendas(d))}

  ${cuidado(n.cuidadoProjecao(d))}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[6]}</h2>
    <p class="muted">O mesmo dado do gráfico anterior, agora dia a dia. Serve para uma lição que
    vale para o dashboard inteiro.</p>
  </header>

  ${g.gContatoDia(d, 452)}
  ${legenda([
    { rotulo: `Dias com ${PISO_AMOSTRA} respostas ou mais`, cor: COR.primary },
    { rotulo: `Dias com menos de ${PISO_AMOSTRA} respostas`, cor: COR.greyLight },
  ])}

  ${comoLer(`A linha azul só liga os dias com amostra suficiente. Os círculos vazios são dias em que
  uma ou duas pessoas responderam — e uma resposta isolada vira 0% ou 100% sem que nada tenha
  mudado na operação.`)}

  ${achado(n.licaoAmostraDia(d))}

  <section style="margin-top:5mm">
    <div class="row">
      <div class="card">
        <h3>A regra prática</h3>
        <p class="small muted">Abaixo de <strong>${PISO_AMOSTRA} respostas</strong>, o percentual não
        é informação. Este relatório aplica esse piso em todo recorte — por isso algumas
        concessionárias e modelos simplesmente não aparecem nos gráficos.</p>
      </div>
      <div class="card">
        <h3>Por que não some do dashboard</h3>
        <p class="small muted">Porque o dashboard é ferramenta de exploração: ele mostra tudo e
        confia em quem lê. O relatório é o contrário — corta o que não sustenta leitura.</p>
      </div>
      <div class="card">
        <h3>O que fazer no dia a dia</h3>
        <p class="small muted">Ao filtrar o dashboard por concessionária ou por semana, olhe primeiro
        o <em>n</em>. Se ele for pequeno, troque o recorte por um maior — mês em vez de dia,
        grupo em vez de loja.</p>
      </div>
    </div>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[7]}</h2>
    <p class="muted">O NPS aparece em cinco gráficos do dashboard. Ele não é uma média de notas, e
    ler como se fosse leva a conclusões erradas.</p>
  </header>

  <section class="row">
    <div class="card">
      <h3>A conta</h3>
      <p class="small muted">NPS = <strong>% de promotores − % de detratores</strong>. Quem dá 7 ou 8
      é neutro e não entra em lado nenhum. O resultado vai de −100 a +100.</p>
    </div>
    <div class="card">
      <h3>Por que não é média</h3>
      <p class="small muted">Numa média, um 10 compensa um 0. No NPS não: os dois se anulam e a nota
      7 desaparece. Por isso um NPS de ${num(k.npsGeral, 1)} não quer dizer “nota
      ${num(k.npsGeral / 10, 1)}”.</p>
    </div>
    <div class="card">
      <h3>Como comparar</h3>
      <p class="small muted">A diferença entre dois NPS se lê em <strong>pontos</strong>, não em
      percentual. De 20 para 30 são dez pontos — não “50% melhor”.</p>
    </div>
  </section>

  <h3 style="margin-top:5mm">As notas cruas, antes de virarem NPS</h3>
  ${g.gNpsNotas(d, 420)}
  ${legNps}

  ${achado(n.leituraNps(d))}
  ${achado(n.polarizacaoNps(d))}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[8]}</h2>
    <p class="muted">O cruzamento mais direto da auditoria: quanto tempo o cliente diz ter esperado
    pelo contato, contra a nota que ele deu.</p>
  </header>

  ${g.gNpsTempo(d, 274)}

  ${comoLer(`Cada barra é uma faixa de tempo declarada pelo cliente, e o valor é o NPS de quem
  respondeu naquela faixa. Barra à direita da linha zero: mais promotores que detratores. À
  esquerda: mais detratores.`)}

  ${achado(n.escadaTempo(d))}

  <h3 style="margin-top:5mm">Quanto tempo os clientes dizem ter esperado</h3>
  ${g.gTempo(d, 240)}

  ${achado(n.pesoDosLentos(d))}

  ${cuidado(`O tempo é <strong>declarado</strong>, não cronometrado — é a lembrança do cliente. Quem
  ficou insatisfeito tende a lembrar de uma espera maior. A escada continua válida como direção;
  os limites exatos das faixas, não.`)}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[9]}</h2>
    <p class="muted">A mesma faixa de tempo, agora contra o que o cliente diz ter acontecido depois.
    É onde a satisfação vira consequência comercial.</p>
  </header>

  ${g.gStatusTempo(d, 330)}
  ${legStatus}

  ${comoLer(`Cada linha é uma faixa de tempo e soma 100% — as barras comparam
  <strong>composição</strong>, não volume. A faixa mais rápida tem ${amostra(
    d.statusTempo.find((t) => t.tempo === "Até 30 minutos")?.total ?? 0,
  )} e a mais lenta ${amostra(
    d.statusTempo.find((t) => t.tempo === "Mais de um dia")?.total ?? 0,
  )}, por isso a largura das faixas coloridas é comparável e a quantidade de pessoas não.`)}

  <h3 style="margin-top:5mm">A faixa vermelha, isolada</h3>
  ${g.gOutraMarcaTempo(d, 240)}

  ${achado(n.escadaOutraMarca(d))}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[10]}</h2>
    <p class="muted">A pergunta de desfecho, lida de duas formas: todos os que responderam, e só os
    que dizem não ter preenchido o formulário na loja.</p>
  </header>

  ${g.gStatusComparado(d, 480)}
  ${legenda([
    { rotulo: "Todos os auditados", cor: COR.primary },
    { rotulo: "Só quem não preencheu o formulário", cor: COR.soft },
  ])}

  ${comoLer(`Cada linha tem dois pontos ligados por um traço. O ponto escuro é a composição de
  todos os auditados; o claro, a de quem não preencheu formulário. <strong>O que interessa é o
  tamanho do traço</strong>: quanto mais longo, mais aquele desfecho muda entre os dois grupos.`)}

  ${achado(n.leituraStatus(d))}
  ${achado(n.leituraFormulario(d))}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[11]}</h2>
    <p class="muted">O cliente escolhe um canal preferido no cadastro. A concessionária escolhe
    outro na hora de procurar. Os dois quase nunca são comparados — aqui são.</p>
  </header>

  ${g.gCanalPreferencia(d, 246)}
  ${legCanal}

  ${comoLer(`Cada linha é um grupo de clientes definido pelo que <strong>eles pediram</strong>, e
  soma 100%. As cores mostram por onde a concessionária de fato falou com eles.`)}

  ${achado(n.leituraCanal(d))}

  <h3 style="margin-top:5mm">NPS por canal usado</h3>
  ${g.gNpsCanal(d, 218)}
  ${achado(n.npsPorCanal(d))}

  ${cuidado(`Este é o gráfico do dashboard mais fácil de ler errado. Canais com poucas avaliações
  aparecem com NPS altíssimo e encabeçam a comparação — sem que isso signifique que ligar funciona
  melhor que mandar mensagem. Compare só o que tem amostra.`)}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[12]}</h2>
    <p class="muted">Os dois recortes que o time usa mais. São grandes o bastante para sustentar
    comparação — mas nem todo modelo entra.</p>
  </header>

  <h3>Taxa de contato por regional</h3>
  ${g.gContatoRegional(d, 316)}

  <h3 style="margin-top:4mm">NPS por regional</h3>
  ${g.gNpsRegional(d, 316)}

  ${achado(n.leituraRegional(d))}

  ${comoLer(`Os dois gráficos não são a mesma coisa em escalas diferentes: taxa de contato mede
  <em>se ligaram</em>; NPS mede <em>o que o cliente achou</em>. Uma regional pode ligar para muita
  gente e ainda assim receber nota baixa.`)}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[13]}</h2>
    <p class="muted">O mesmo par de leituras, agora por modelo de veículo. Aqui o piso de amostra
    começa a cortar linhas.</p>
  </header>

  <h3>Taxa de contato por modelo</h3>
  ${g.gContatoModelo(d, 324)}

  <h3 style="margin-top:4mm">NPS por modelo</h3>
  ${g.gNpsModelo(d, 324)}

  ${achado(n.leituraModelo(d))}

  ${cuidado(`Modelo não é causa. Um modelo com NPS baixo pode estar concentrado numa regional lenta,
  ou ser um lançamento com fila de entrega. O gráfico aponta onde olhar — não explica o porquê.`)}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[14]}</h2>
    <p class="muted">O recorte mais pedido e o mais perigoso. De todas as concessionárias que
    aparecem na auditoria, poucas têm respostas suficientes para um percentual significar algo.</p>
  </header>

  ${achado(n.leituraDn(d))}

  <h3 style="margin-top:4mm">As ${Math.min(8, d.tabelaDn.length)} com maior taxa de contato</h3>
  ${tabelaDn(d.tabelaDn.slice(0, 8))}

  <h3 style="margin-top:4mm">As ${Math.min(8, d.tabelaDn.length)} com menor taxa de contato</h3>
  ${tabelaDn(d.tabelaDn.slice(-8))}

  ${comoLer(`A coluna <strong>Respostas</strong> vem antes da taxa de propósito: é ela que diz o
  quanto acreditar na linha. ${num(PISO_AMOSTRA)} respostas é o mínimo para entrar na tabela, e
  mesmo assim uma taxa medida em ${num(PISO_AMOSTRA)} respostas se move muito com uma resposta a
  mais.`)}

  ${cuidado(`Esta tabela não é ranking de desempenho. Uma loja pode aparecer no fim porque atende
  mal, porque recebe leads de pior qualidade, ou porque os clientes dela simplesmente respondem
  menos à auditoria. Use como ponto de partida de conversa, não como veredito.`)}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[15]}</h2>
    <p class="muted">Um recorte que não vem da auditoria e sim da base de leads — útil para
    entender o que a auditoria está medindo.</p>
  </header>

  ${g.gSubOrigem(d, 292)}

  ${comoLer(`O comprimento da barra é <strong>volume</strong> de leads. O texto ao lado traz o mesmo
  volume e a taxa de conversão em venda. Uma barra longa com percentual baixo é uma origem que
  entrega muito lead e pouca venda.`)}

  ${achado(n.leituraOrigem(d))}

  <h3 style="margin-top:4mm">Taxa de contato por origem</h3>
  ${g.gContatoOrigem(d, 252)}

  ${achado(n.leituraContatoOrigem(d))}

  ${cuidado(`Conversão baixa não quer dizer origem ruim. Vendas Corporativas e VWFS têm ciclo e
  registro de venda diferentes do varejo — comparar a taxa delas com a de Site Ofertas é comparar
  processos, não canais.`)}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[16]}</h2>
    <p class="muted">Os cartões vermelhos do dashboard. São os únicos números da auditoria que não
    saem direto de uma resposta — e por isso merecem uma página inteira.</p>
  </header>

  <div class="row">
    ${kpi("Perdidas no atendimento", num(k.perdasAtendimento), "", "estimativa a partir de quem não foi contatado")}
    ${kpi("Perdidas para a concorrência", num(k.perdasConcorrencia), "", "declaradas pelo próprio cliente")}
    ${kpi("Total", num(k.perdasTotal), "", "soma das duas")}
    ${kpi("Faturamento", "R$ " + mi(k.faturamentoPerdido), " mi", `a R$ ${num(TICKET_MEDIO)} de ticket médio`)}
  </div>

  ${achado(n.leituraPerdas(d))}

  <section style="margin-top:5mm">
    <h3>Como a conta é montada</h3>
    <table class="acao passos">
      <tbody>
        <tr><td class="n">1</td><td><strong>Quem disse que não foi contatado</strong><br><span class="small muted">Da amostra que respondeu à pergunta de contato, os que responderam “não”.</span></td></tr>
        <tr><td class="n">2</td><td><strong>× a conversão da base</strong><br><span class="small muted">${pct(
          k.txVendas,
        )} — a taxa de conversão geral do período. A premissa é que esses leads converteriam como a média se tivessem sido atendidos.</span></td></tr>
        <tr><td class="n">3</td><td><strong>+ quem declarou compra na concorrência</strong><br><span class="small muted">${num(
          k.perdasConcorrencia,
        )} clientes que responderam “comprei de outra marca”. Esses não são estimativa: são declaração.</span></td></tr>
        <tr><td class="n">4</td><td><strong>× ticket médio</strong><br><span class="small muted">R$ ${num(
          TICKET_MEDIO,
        )} fixos, definidos pelo negócio. Não é o ticket medido do período.</span></td></tr>
      </tbody>
    </table>
  </section>

  <section style="margin-top:4mm">
    <h3>O mesmo cálculo, aberto por regional</h3>
    <table>
      <thead><tr><th>Regional</th><th class="num">Leads</th><th class="num">Vendas</th><th class="num">Respostas</th><th class="num">Taxa de contato</th><th class="num">Vendas perdidas</th></tr></thead>
      <tbody>${d.tabelaRegional
        .map(
          (x) => `<tr>
          <td class="nome">Regional ${x.regional}</td>
          <td class="num">${num(x.leads)}</td>
          <td class="num">${num(x.vendas)}</td>
          <td class="num">${num(x.nContato)}</td>
          <td class="num">${pct(x.txContato)}</td>
          <td class="num">${num(x.perdas)}</td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>
  </section>

  ${cuidado(n.ressalvaPerdas(d))}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[17]}</h2>
    <p class="muted">O campo aberto da auditoria. Uma IA classifica cada comentário e extrai as
    palavras que carregam sentido — é o único dado qualitativo do dashboard.</p>
  </header>

  <h3>Comentários por sentimento</h3>
  ${g.gSentimento(d, 140)}

  ${achado(n.leituraSentimento(d))}

  <h3 style="margin-top:4mm">As palavras que mais aparecem</h3>
  ${g.gPalavras(d, 336)}
  ${legSent}

  ${comoLer(`A cor da palavra é o sentimento <strong>dominante</strong> dos comentários em que ela
  aparece — “atendimento” em vermelho não quer dizer que a palavra seja negativa, e sim que ela
  aparece mais em comentários negativos. No dashboard isto é uma nuvem; aqui virou barra porque
  nuvem impressa não se lê.`)}

  ${achado(n.leituraPalavras(d))}
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[18]}</h2>
    <p class="muted">A pergunta mais nova da auditoria, e um exemplo de como olhar para um dado que
    ainda não sustenta conclusão.</p>
  </header>

  ${g.gConcorrencia(d, 334)}

  ${comoLer(`Só quem respondeu “comprei de outra marca” recebe esta pergunta, e responder o modelo é
  opcional. A IA separa marca e modelo do texto livre — “Caoa Chery Tiggo 5 x Pro” vira marca
  <em>CAOA Chery</em>, modelo <em>Tiggo 5</em>.`)}

  ${achado(n.leituraConcorrencia(d))}

  ${cuidado(`Com essa amostra, a diferença entre a primeira e a segunda marca é uma resposta. Não
  há ranking de concorrência aqui — há a confirmação de que a pergunta funciona e de que a base
  vai crescer.`)}

  <section style="margin-top:5mm">
    <h3>Três perguntas antes de abrir o dashboard</h3>
    <table class="acao">
      <tbody>
        <tr><td class="n">1</td><td><strong>Qual é o n deste recorte?</strong><br><span class="small muted">Se for menor que ${PISO_AMOSTRA}, o percentual não sustenta leitura. Abra o recorte.</span></td></tr>
        <tr><td class="n">2</td><td><strong>Este número fala da base ou da amostra?</strong><br><span class="small muted">Volume e conversão falam da base. Contato, tempo, canal, NPS e status falam de quem respondeu.</span></td></tr>
        <tr><td class="n">3</td><td><strong>O que mudou: o dado ou o denominador?</strong><br><span class="small muted">Uma taxa sobe quando mais gente confirma contato — e também quando menos gente responde. Olhe o n junto.</span></td></tr>
      </tbody>
    </table>
  </section>
</div>

<div class="page">
  <header class="sec">
    <h2>${secoes[19]}</h2>
    <p class="muted">Os termos que aparecem no dashboard e neste relatório.</p>
  </header>

  <table class="glos">
    <tbody>
      ${GLOSSARIO.map(([t, def]) => `<tr><td class="nome" style="width:34%">${t}</td><td class="muted">${def}</td></tr>`).join("")}
    </tbody>
  </table>

  <div style="margin-top:6mm">
    ${comoLer(`Este relatório cobre o período de ${n.periodo(d)}. O dashboard é vivo: os números se
    movem a cada dia de auditoria. O que não muda são as regras de leitura das páginas anteriores.`)}
  </div>
</div>
`;
}
