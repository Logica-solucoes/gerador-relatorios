# O que está no relatório

Conteúdo de negócio do `relatorio.pdf` — página por página, com os números-chave e a lógica
por trás de cada um. Para como o PDF é gerado, ver `README.md`. Para regras de código,
`CLAUDE.md`.

Gerado a partir de `basf_vendas` (SQL Server, base `Basf-Relatorio`), recorte **janeiro–junho,
2026 vs. 2025** (dados de 2026 até 25/06). Todo valor abaixo é deste recorte, exceto onde a
página mostra série histórica (2022–2026).

## Do relatório antigo pra este

O relatório anterior era uma apresentação em slides com gráficos bonitos, mas os números não
tinham sido confirmados contra o banco — e quando confirmei, boa parte não batia:

| Relatório antigo dizia | O banco mostra |
|---|---|
| "Março é +50% da receita do trimestre" | Março é 20,7% do semestre — o pico real é maio/junho |
| Maior cliente: A Sementeira | Maior cliente: Nunhems Netherlands, 8× mais receita, nem citado |
| Agrícola Famosa "caiu R$ 8,48 Mi" | Comparava o **ano cheio** de 2025 com **4 meses** de 2026 — a cliente está saudável |
| Tom geral positivo ("pico substancial") | Faturamento do semestre caiu 47% |

Ou seja: não era um problema de design, era um problema de os números não serem os números
reais. O trabalho aqui não foi "deixar bonito" — foi refazer a análise do zero, direto na base
de dados, e só depois desenhar em torno do que os dados realmente mostram.

## A ideia central deste relatório

Duas regras guiaram tudo, e as duas existem pra evitar o mesmo erro do relatório antigo — um
número ou uma frase que parece certa mas não é o que o dado diz:

1. **Todo número vem de uma consulta ao banco, nunca de estimativa solta.** Não existe "isso
   parece que caiu" — existe "caiu 47,0%, calculado assim". Quando uma estimativa é
   deliberadamente conservadora (como a recuperação de preço na página 7), o texto diz isso
   explicitamente e mostra o número mais otimista como referência, não como meta.

2. **O texto muda quando o dado muda.** Se a próxima atualização mostrar receita subindo em vez
   de caindo, o relatório não vai continuar dizendo "a receita caiu" — a frase é calculada a
   partir do sinal do número, não escrita à mão de uma vez só. Isso é o que separa este
   relatório de uma apresentação estática: ele foi feito para ser **regenerado**, não reescrito.

O resultado é um relatório com uma única linha do começo ao fim: a receita caiu quase pela
metade, aqui está exatamente de onde saiu cada parte da queda, e aqui estão as ações com valor
e prazo pra reagir — em vez de seis slides desconexos sobre temas diferentes.

## Tese central

O faturamento do semestre caiu **47,0%** (R$ 65,71 Mi → R$ 34,85 Mi) e o volume caiu quase o
dobro disso, **62,2%**. A diferença entre as duas quedas é o fio que conecta o relatório: não é
só "vendemos menos", é "vendemos muito menos e defendemos receita subindo o preço médio" — o
que resolve o trimestre e esconde a erosão de base para o próximo.

Dos R$ 30,86 Mi perdidos, **quatro movimentos** respondem por tudo (página 2): a maior fatia
(45%) é queda em venda intercompany (Nunhems Netherlands, não é cliente final), o resto é
mercado brasileiro real — clientes que pararam de comprar e clientes que compraram menos.

---

## Página 1 — Sumário executivo

4 métricas de capa, todas com variação vs. 2025:

| Métrica | 2026 | Variação |
|---|---|---|
| Faturamento | R$ 34,85 Mi | −47,0% |
| Volume | 1,07 Bi sementes | −62,2% |
| Clientes ativos | 104 | −16,8% (perdeu 44) |
| Ticket por pedido | R$ 63 mil | −29,8% |

Um índice com as 9 páginas seguintes ocupa a metade inferior — cada linha aponta pro `<h2>` real
da página, então renomear uma seção não deixa o índice mentindo (mesmo array de títulos alimenta
os dois lugares, ver `pages.ts`).

## Página 2 — Onde foram os R$ 30,86 milhões

Waterfall: YTD 2025 → 4 etapas → YTD 2026. As etapas somam exatamente a diferença (é uma
partição exaustiva, não uma aproximação):

```
YTD 2025          R$ 65,71 Mi
Export            −R$ 13,88 Mi   (45% da queda — Nunhems Netherlands, intercompany)
Clientes perdidos  −R$ 5,80 Mi   (saíram da base)
Retidos (variação) −R$ 12,47 Mi  (compraram menos, mas continuam clientes)
Clientes novos     +R$ 1,05 Mi
YTD 2026          R$ 34,85 Mi
```

**Por que isso importa:** a maior fatia isolada não é problema comercial — é volume
intercompany, que tem dinâmica própria. Descontando ela, sobram R$ 16,99 Mi de queda real de
mercado brasileiro, majoritariamente de clientes que **já eram nossos**.

## Página 3 — São dois negócios, não um

Justifica separar BR de export em todo o resto do relatório: as duas curvas mensais (2022–2026)
têm formato diferente, e olhar as duas somadas escondia o problema de volume.

No Brasil: receita −41,5%, volume −66,9%. O preço médio subiu de R$ 27,86 para R$ 49,17 por mil
sementes — não é reajuste, é mudança de mix (parou de vender barato em escala, a cesta ficou
concentrada em sementes caras). Isso sustenta receita no curto prazo e esconde a erosão de
volume, que é o indicador antecedente de recompra.

## Página 4 — Onde está a margem escondida

Dois ângulos sobre preço:

- **Preço × volume por cultura** (scatter, bolha = faturamento): as 5 culturas (Melancia, Melão,
  Tomate, Cebola, Cenoura) perderam volume em 2026. Nenhuma está no quadrante que compensaria as
  outras. Melancia e Cebola seguraram preço com volume caindo (perda de participação); Melão,
  Tomate e Cenoura cederam os dois (pressão competitiva real).
- **Tecnologia de tratamento**: Seeds Standard é 90%+ do volume a R$ 38/mil sementes. Primed
  FarMore F300 vale **R$ 1.324/mil** — 35× mais caro. Migrar uma fração pequena do volume padrão
  para tratamento premium move mais margem do que qualquer ganho de volume plausível no semestre.

## Página 5 — A carteira está concentrada e encolhendo

- **Pareto**: Nunhems Netherlands = 31% da receita 2026 sozinha. Top 10 clientes = 68%.
- **Coorte de clientes** (YTD, mesma janela do waterfall): 81 retidos, 44 perdidos, 16 novos,
  7 reativados. **96% da receita** vem de quem já comprava — a reposição não cobre nem um
  quinto do que saiu.

**Risco explícito:** perder 1 cliente do topo (Nunhems ou o 2º maior) pesa mais que os 44 que já
saíram.

## Página 6 — Clientes dormentes: R$ 7,56 Mi na mesa

Tabela nominal: 10 clientes que compraram em 2025 e nada em 2026, com valor perdido, última
compra e dias parado. É lista de ligação, não gráfico — ordenada por valor.

Ao lado, frequência de compra 2026: **45 dos 104 clientes ativos compraram em 1 único mês** do
semestre (R$ 4,14 Mi no total). No outro extremo, quem compra em 5–6 meses concentra a maior
parte da receita — a diferença é cobertura comercial, não potencial de compra.

## Página 7 — Vazamento de preço

Acha o mesmo SKU (mesmo item **e** mesma embalagem — sem isso, desconto legítimo de volume
apareceria como "vazamento") vendido a preços muito diferentes por cliente:

- Cebola Sofire: spread de 45% entre o melhor e o pior preço praticado (16 clientes).
- Tomate Strongton: 42% (12 clientes).
- Melancia Brabba S10 (maior faturamento): 24 clientes, preço variando de R$ 269 a R$ 362 por
  mil sementes.

**Recuperação estimada: R$ 0,67 Mi** — conservadora, calculada contra a *mediana* do próprio
SKU (não o melhor preço). O teto teórico contra o melhor preço seria R$ 2,55 Mi, citado como
referência mas não usado como meta — não é defensável numa reunião.

Ressalva explícita no texto: parte do desconto é legítimo (volume, contrato, safra); o número
mede dispersão sem política formal, não "dinheiro roubado".

## Página 8 — Cross-sell: a base compra uma cultura só

73 dos 101 clientes brasileiros compram **uma cultura só** (ticket médio R$ 171k). Quem compra 2
tem ticket de R$ 480k — 2,8× maior. O texto é explícito que isso é **associação, não
causalidade** (conta maior naturalmente compra mais itens; o múltiplo não deve virar meta por
cliente — ver decisão registrada no README).

Em vez de aplicar o múltiplo, a tabela nominal mostra o *porte relativo*: os 8 maiores clientes
mono-cultura, todos entre 2,3× e 9,6× o ticket médio de um mono-cultura — ou seja, contas
grandes presas a um produto, não compradores pequenos. Somam R$ 6,62 Mi hoje.

## Página 9 — Qualidade operacional

Quatro sinais que não aparecem direto no resultado:

- **Devoluções**: 4,8% do faturamento bruto em 2026 — pior ano da série 2022–2026.
- **R$ 1,43 Mi em "SALES ERROR"** — maior motivo isolado de devolução, e é erro de processo
  interno, não recusa do cliente.
- **Pedidos de última hora**: 53% dos pedidos têm ≤1 dia entre pedido e data desejada (era 7% em
  2022) — planejamento de demanda quebrado.
- **Portfólio encolheu 54%** (338 SKUs em 2025 → 155 em 2026), e 21 itens já concentram 80% da
  receita.
- **1 vendedor (código BR90) atende 102 dos 104 clientes ativos** — risco de continuidade.
- Cobertura contratual: só 62% das linhas faturadas no Brasil têm acordo comercial registrado —
  é onde o vazamento de preço da página 7 se origina.

## Página 10 — Plano de ação

7 ações, ordenadas por relação valor/esforço. Prioridade **não é fixa por posição** — é derivada
de ter ou não R$ calculável (`prioridadeAcao()` em `narrativa.ts`):

| # | Ação | Valor em jogo | Prazo |
|---|---|---|---|
| 1 | Piso de preço por SKU | R$ 0,67 Mi | 30 dias |
| 2 | Recuperar os 10 dormentes | R$ 7,56 Mi | 60 dias |
| 3 | Cross-sell nos 8 mono-cultura | R$ 6,62 Mi (base em risco, não ganho estimado) | 1 safra |
| 4 | Auditar "SALES ERROR" | R$ 1,43 Mi | 45 dias |
| 5 | Elevar cobertura contratual 62%→85% | Estrutural | 90 dias |
| 6 | Segundo vendedor nas contas-chave | Mitigação | 90 dias |
| 7 | Calendário comercial por cultura | Previsibilidade | 1 safra |

Ações 1, 2 e 4 somam **R$ 9,66 Mi** de receita endereçável com número calculável — sem depender
de cliente novo, sem contar recuperação do volume intercompany. A ação 5 lê "elevar" só se a
cobertura atual ainda estiver abaixo da meta (`metaCobertura()`); se já tiver passado de 85%,
o texto muda para "manter" — não fica dizendo para subir o que já caiu.

Fecha com notas metodológicas em linguagem de negócio (sem nome de coluna do banco).

---

## Números que aparecem em mais de uma página (para conferência)

Se o relatório for regenerado com dados novos, estes são os elos que devem casar entre páginas:

- **R$ 30,86 Mi** (queda YTD) = base da manchete (p.1), base do waterfall (p.2).
- **Nunhems Netherlands** = maior linha do waterfall export (p.2) = topo do Pareto (p.5).
- **44 clientes perdidos** = KPI da capa (p.1) = "Clientes perdidos" da coorte (p.5).
- **62% cobertura contratual** = tema da p.9 = meta da ação 5 (p.10).
- **8 SKUs / 10 dormentes / 8 mono-cultura** = contagens que aparecem tanto no corpo da página
  quanto citadas no plano de ação (p.10) — são `d.spread.length`, `d.dormentes.length`,
  `d.monoCultura.length`, nunca reescritas à mão.
