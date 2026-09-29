# CLAUDE.md — VW Auditoria

Regras de negócio do cliente Volkswagen (Auditoria de Leads). Regras de motor (comandos, Docker,
WeasyPrint, Plot) estão no `CLAUDE.md` da raiz. Não confundir com `clients/vw/`, que é o modelo
de Lead Scoring — outro assunto, mesma marca, mesma paleta.

## Comando

```bash
CLIENT=vw_auditoria bun --env-file=clients/vw_auditoria/.env run core/build.ts
docker compose run --rm --env-from-file clients/vw_auditoria/.env -e CLIENT=vw_auditoria \
  -e DB_HOST=host.docker.internal relatorio
```

O `-e DB_HOST=host.docker.internal` é obrigatório no container: o SQL Server roda na máquina do
dev, e `localhost` dentro do container é o próprio container.

## O que este relatório é

**Um manual de leitura, não um relatório de resultado.** O pedido foi apresentar a auditoria para
quem nunca a viu e ensinar a ler os gráficos do dashboard. Toda página segue a mesma estrutura:
gráfico → `comoLer()` (regra de leitura, prosa neutra) → `achado()` (derivado do dado) →
`cuidado()` onde o gráfico engana. Se você adicionar uma página, siga os três blocos; se remover
o `cuidado()` de uma página que tem armadilha, o relatório deixa de fazer o que existe para fazer.

O tom é exploratório e didático, não acusatório — decisão do negócio. Nada de "você está perdendo
X". A página de vendas perdidas existe porque está no dashboard, e abre a metodologia inteira em
vez de vender o número.

## Regras que não podem quebrar

**A fonte da verdade é `VwApiAuditoria/db.py`.** Toda regra de recorte foi copiada de lá porque o
relatório e o dashboard vão ser lidos lado a lado. Se `db.py` mudar, `queries.ts` muda junto:

- Janela `dt_criacao BETWEEN '2026-06-01' AND ontem`. **Sempre pela data de criação do lead**,
  nunca pela data de resposta da auditoria (`dt_pergunta`). Auditoria respondida com lag vazaria
  para o mês seguinte e apareceria dado em mês sem lead criado.
- `DIAS_LAG = 15`: os cartões de volume/vendas/conversão cortam os últimos 15 dias. Lead de ontem
  não teve tempo de ser contatado, e contá-lo derruba a conversão sem nada ter acontecido. É por
  isso que o relatório mostra **dois** números de leads (`leadsCriados` e `leadsDisponiveis`) — a
  diferença entre eles é conteúdo didático da página dos cartões, não inconsistência.
- Venda = `venda_identificada = 1 OR dt_fatura IS NOT NULL`.
- NPS: promotor ≥ 9, detrator ≤ 6, escala −100 a +100. Neutro (7 e 8) não entra na conta.
- Dia ou mês sem nenhuma resposta **não** vira ponto 0% no gráfico.
- Vendas perdidas = conversão global × quem respondeu "não houve contato", + quem declarou compra
  na concorrência. `TICKET_MEDIO = 130.000` é **premissa fixa do negócio**, não medição.

**`PISO_AMOSTRA = 10` é o argumento central do documento.** Todo recorte abaixo de 10 respostas
sai do gráfico ou vai para cinza. Sem ele, a concessionária Caragua com 3 respostas encabeçaria o
ranking com 100%. Se algum gráfico novo não respeitar o piso, ele contradiz a página
"Quando o gráfico engana".

**Texto vs. dados.** Se uma frase deixaria de ser verdade com outro período, ela pertence a
`narrativa.ts` e precisa de teste. `pages.ts` só carrega prosa neutra (definição de métrica,
descrição de eixo, o que a pergunta mede). Nunca escreva um veredito direto no template.

**Referência cruzada de página usa `pg("<seção>")`**, não número literal. `pg()` assume **uma
página por seção**: se alguma seção virar duas páginas, `pg()` passa a mentir para tudo que vem
depois. Foi por isso que "Regionais e modelos" virou duas seções — a página era uma só no
rascunho e o número quebrou.

## Armadilhas já pagas

- **`mssql.query()` não enxerga `#temp` criada por outra `query()`.** O `query()` executa via
  `sp_executesql`, e temp table criada dentro de sproc morre com ela. `materializar()` usa
  `.batch()` justamente por isso. E `pool: { max: 1 }` não é ajuste de performance: é o que garante
  que todas as queries caiam na mesma sessão e enxerguem a `#aud`.
- **Barra em escala log não desenha.** O funil nasceu com `type: "log"` e saiu como grade e rótulo
  sem barra nenhuma (o `barX` perde a baseline). Hoje a barra é **retenção** — % do degrau acima —
  e o volume absoluto vai no rótulo. Não volte para log.
- **`legend: true` do Plot quebra a altura do SVG.** A legenda nativa devolve um `<figure>` com um
  `<style>` extra, e o `plot()` do core só limpa o primeiro. Use `legenda()` de `report.ts`, que
  gera markup comum.
- **`comentario_ia` não é comentário.** É um código numérico (0/1/2). O texto que o dashboard
  exibe como comentário é `palavras_resposta` — a redução do que o cliente escreveu às palavras
  que carregam sentido. É por isso que os "comentários" parecem telegráficos.
- **A nuvem de palavras virou barra.** Nuvem impressa em A4 vira mancha. A cor da barra é o
  sentimento **dominante** dos comentários em que a palavra aparece, não a polaridade da palavra.
- **Nome fantasia de concessionária se repete.** "Green Automoveis" e "Vega" aparecem em DNs
  diferentes. A tabela mostra `nome · dn` — sem o código, parecia linha duplicada.

## Limites conhecidos dos dados

- **Concorrência tem n=14.** `marca_ia` só existe para 14 das 7.818 linhas de auditoria: apenas 36
  pessoas responderam qual carro compraram, e a IA extraiu marca de 14. O heatmap "modelo desejado
  × modelo comprado" do dashboard **não** virou página — não sustenta. O que existe é um painel
  pequeno com o aviso na cara.
- O join de concorrência foi corrigido no master da API em 12/08/2026: é
  `va.id_externo COLLATE Latin1_General_CS_AS = vw_volks_min_leads.id_principal`. O antigo
  `CAST(id_externo AS bigint)` quebra — `id_externo` é ID Salesforce alfanumérico.
- **`relacao_posse` é inútil.** É um ID cru (`RP-20971892`), um por lead. Não vira recorte.
- **NPS por canal é a armadilha favorita do dashboard.** E-Mail aparece com NPS 100 sobre
  **1 avaliação**. O gráfico mostra o canal em cinza com "amostra insuficiente" no rótulo em vez de
  escondê-lo — esconder tiraria a lição.
- **Tempo de resposta é declarado, não cronometrado.** É a lembrança do cliente, e quem ficou
  insatisfeito lembra de espera maior. A escada NPS × tempo vale como direção, não como medição.

## Projeção da taxa de conversão (página 7)

**A única página que empresta dado de outro relatório.** A curva vem de
`clients/vw/_intake/modelo_base.json` (`faixas_score`), copiado para
`clients/vw_auditoria/_intake/` — reexporte os dois juntos se o modelo mudar. `queries.ts` só lê
o arquivo (`capturaEm`/`ganho` são cópias das mesmas funções de `clients/vw/queries.ts`; os dois
clientes não compartilham módulo, então se a lógica de interpolação mudar lá, muda aqui também).

**Nível vem daqui, forma vem de lá.** `projecao.taxaHoje` é `disp.vendas/disp.leads` — conversão
real, medida, do período disponível desta auditoria — não a conversão do OOT do modelo (outra
base, outro recorte). Só a *forma* da curva (o quanto o topo do score converte mais que o fundo)
é emprestada. Sem essa separação a manchete usaria a conversão do modelo, que é de outra
população.

**`projecao.corte` é percentual de amostra** (`taxa de contato`, medida em `nContato` respostas),
não a base inteira — a mesma ressalva do "Não faça" abaixo. Ele entra só como parâmetro de posição
na curva do modelo (`capturaEm(faixas, corte)`), nunca multiplicado direto por `leadsCriados`.

**`vendasHoje`/`vendasOrdenada` são do período disponível da auditoria**, não de um mês nem da
base toda — `narrativa.projecaoVendas()` cita o período nas duas pontas.

## Não faça

- Multiplicar percentual da amostra por volume da base em nenhuma frase ou gráfico.
- Somar percentuais vindos de gráficos com `n` diferente.
- Transformar a tabela de concessionárias em ranking de desempenho — o `cuidado()` daquela página
  existe para impedir exatamente isso.
- Incluir Cliente Oculto aqui. São 113 leads plantados, quase todos SP, e é outro relatório.
- Tratar `+vendas a mais` da página de projeção como número contratado — `cuidadoProjecao()` já diz
  isso ao leitor; não escreva o oposto em nenhuma outra página.
