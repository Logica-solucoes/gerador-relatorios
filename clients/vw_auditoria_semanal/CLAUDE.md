# CLAUDE.md — VW Auditoria Semanal

Regras de negócio do acompanhamento semanal da Auditoria de Leads da Volkswagen. Regras de motor
(comandos, Docker, WeasyPrint, Plot) estão no `CLAUDE.md` da raiz.

**Três relatórios VW, não confundir:** `clients/vw` é o modelo de Lead Scoring, `clients/vw_auditoria`
é o manual de leitura do dashboard (21 páginas, didático) e este é o **acompanhamento operacional
semanal** (3 páginas, direto ao ponto). Os três leem bancos/insumos diferentes e circulam no mesmo
time — se um número aparecer nos três, ele tem que bater.

## Comando

```bash
CLIENT=vw_auditoria_semanal bun --env-file=clients/vw_auditoria_semanal/.env run core/build.ts
docker compose run --rm --env-from-file clients/vw_auditoria_semanal/.env \
  -e CLIENT=vw_auditoria_semanal -e DB_HOST=host.docker.internal relatorio

# reprocessar uma rodada antiga (auditoria, conferência, semana que falhou):
docker compose run --rm --env-from-file clients/vw_auditoria_semanal/.env \
  -e CLIENT=vw_auditoria_semanal -e DB_HOST=host.docker.internal -e HOJE=2026-08-20 relatorio
```

Mesmo banco (`LogicaChatBot`) e mesmo `.env` do `vw_auditoria`. `-e DB_HOST=host.docker.internal`
é obrigatório no container: o SQL Server roda na máquina do dev.

`HOJE=AAAA-MM-DD` é a data que o relatório considera "hoje". A semana lida é sempre a última
semana **fechada** antes dela — então `HOJE=2026-08-20` reprocessa 10–16/08. Sem ela, é a data real.

## Publicação no portal

`core/build.ts --publicar` sobe o PDF em `PORTAL_URL` (portal VwAuditoria) com assunto
`Auditoria`, título `Relatório Semanal Auditoria - Semana N` e referência `Mês/AAAA` — o padrão do
que já era publicado à mão. N e o mês saem do **domingo** da semana lida: 28/09–04/10 é
`Outubro/2026` Semana 1. Mesmo título + referência já no portal → não envia de novo, então o n8n pode
repetir a chamada. O portal devolve erro com HTTP 200 e `status: 1`; `publicar.ts` checa o corpo.

## O que este relatório é

**Três páginas, densidade alta, sem capa e sem índice.** Página 1 = o pulso da semana (comparativo).
Página 2 = perdas: onde e por quê (janela de 8 semanas). Página 3 = o mês até aqui (acumulado, com
comparação contra o mês anterior). O leitor é operacional e lê em pé — se algo não couber, corta
conteúdo, não diminui fonte.

**Três páginas é requisito, não meta.** Toda mudança precisa passar pela medição de preenchimento
(ver `CLAUDE.md` da raiz, "Medir preenchimento em vez de chutar"). Alvo: 88–99%; hoje fecha em
98 / 96 / 91%. Foram necessárias várias rodadas de ajuste — não mexa em altura de gráfico, `padding`
de `.compacta` ou tamanho de fonte sem medir depois.

## A decisão que define o relatório: data da auditoria, não data do lead

**Tudo aqui recorta por `data` — o dia em que a auditoria foi feita.** O dashboard de auditoria e o
`vw_auditoria` recortam por `dt_criacao` (data do lead); este relatório faz o contrário de
propósito, a pedido do negócio. A pergunta é operacional — *"o que a auditoria apurou na semana
passada?"* — e a amostra é sorteada: uma rodada de segunda ouve leads do começo e do fim do mês.
Recortar por `dt_criacao` espalhava uma mesma rodada por semanas diferentes.

Não "conserte" isso para bater com o dashboard. Os números **não vão bater** com o dashboard para a
mesma semana, e é esperado: são recortes diferentes. O subtítulo da página 1 diz isso em toda edição.

Consequências:

- **Semana = última semana fechada do calendário**, segunda a domingo (`semanaPassada()`). Gerando
  na terça 22/09: 14–20/09 contra 07–13/09. A semana corrente nunca entra, nem gerando no domingo.
- **Mês = auditorias de dia 1 até o domingo da semana lida.** Em 22/09: 01–20/09.
- **Não existe maturação.** Auditoria feita é fato consumado; a semana fecha no domingo e está
  completa. A versão anterior (por `dt_criacao`) precisava esperar ~4 semanas a esteira alcançar o
  lead e escolhia a semana consultando o banco. Isso tudo sumiu — `DIAS_LAG`, `semanaMadura()`.
- **`data` é `datetime2`.** Todo filtro de dia usa `CAST(data AS DATE)`. Comparar direto com
  `'2026-09-20'` corta tudo que foi auditado depois da meia-noite do último dia.
- **Conversão e vendas perdidas saem da amostra auditada** (`venda` da própria view), não de
  `vw_volks_leads`. Com o recorte na data da auditoria não existe denominador da rede que case com a
  semana. `vw_volks_leads` não é mais lida por este relatório.

**Nada antes de 17/08/2026 entra no relatório** (`INICIO_QUESTIONARIO` em `queries.ts`). É o dia em
que a pergunta do questionário mudou; as respostas antigas respondiam outra coisa e, na série,
apareciam como uma alta de ~50% para ~75% de contato que não aconteceu. O corte vale para tudo:
a série da página 1, a janela da página 2 (que por isso mostra "últimas N semanas, desde a mudança
do questionário" até completar 8 semanas, em meados de outubro) e o mês anterior da página 3. Mês
anterior que começa antes de 17/08 sai **inteiro** da comparação — sobrar só 17–20/08 compararia 4
dias com 20. Em setembro/2026 a página 3 sai sem comparação por isso; de outubro em diante volta.

**Semana sem nenhuma auditoria derruba o processo** (`carregar()` lança). Sem isso o relatório sairia
com todo KPI em 0,0% — PDF plausível e errado, que o agendador publicaria.

## Página 3: o acumulado do mês

**O comparativo é o mesmo recorte de dias do mês anterior** (01–20/09 contra 01–20/08), não o mês
fechado. Comparar 20 dias com 31 leria calendário como desempenho. Mês anterior mais curto
(fevereiro) trunca no último dia dele, e aí `dias` e `diasAnt` divergem: o subtítulo avisa.

**Mês anterior sem auditoria é caso real, não defeito.** A auditoria começou em 23/07/2026 e trabalha
em mutirão, então o primeiro mês de cada série vem vazio ou magro. Quando o anterior tem menos de
`PISO_AMOSTRA` respostas: KPI fica **sem seta**, a série "anterior" **some** do gráfico regional, a
coluna Δ vira `—` e `vereditoMes()` troca "evolução" por "nível". Nunca desenhe 0% ao lado de 54% —
isso se lê como colapso, não como ausência.

**O desfecho do mês é comparado em p.p., não em contagem.** Os dois recortes têm total de respostas
diferente; "213 contra 188" leria volume de auditoria como mudança de comportamento. A seta respeita
o sinal do desfecho (`perda()` / `venda()` em `report.ts`): subir "Comprei um VW" é verde, subir
"Não fui à concessionária" é vermelho, o que não tem sinal e o que não mexeu ficam cinza.

## Geração automática

O relatório é feito para rodar sozinho toda semana. O contrato com o agendador (hoje, **n8n**) é:

1. Chamar `POST http://gerador:3000/gerar/vw_auditoria_semanal` (ver `deploy/README.md`), que roda `core/build.ts --publicar` numa máquina que enxergue o banco.
2. **Exit code é a verdade.** Semana sem auditoria, banco fora ou variável faltando derrubam o
   processo com mensagem — nunca geram PDF plausível e errado. Falha = não publica, e avisa.
3. `carregar()` imprime `→ semana AAAA-MM-DD a AAAA-MM-DD · mês …` no stdout.
4. O PDF fica em `out/vw_auditoria_semanal/relatorio.pdf`, sobrescrito a cada rodada.

Reprocessar é idempotente: mesma `HOJE`, mesmo PDF (desde que o banco não tenha mudado).

A publicação no portal é feita aqui (`publicar.ts`, ver "Publicação no portal"), não no n8n: o n8n só agenda, chama e avisa por e-mail quando a resposta não é `ok`.

## Qual corte é semanal e qual é acumulado

Definido por amostra medida, não por gosto. **Não promova um corte acumulado para semanal** sem
conferir o `n` — foi assim que a primeira versão quase publicou motivo declarado com 1 resposta na
cauda.

| Corte | Grão | Por quê |
|---|---|---|
| Taxa de contato, NPS, conversão, vendas perdidas | **semanal** | ~165 a 560 respostas por semana |
| Regional | **semanal** | ~33 a 52 respostas por regional |
| Motivo declarado | acumulado (8 sem.) | semanal: 19 no topo, **1** na cauda |
| NPS × tempo | acumulado (8 sem.) | semanal: ~10 por faixa, no limite do piso |
| Concessionária, origem | acumulado (8 sem.) | semanal nenhuma DN chega a 10 respostas |
| Desfecho com Δ | **mensal** (pág. 3) | é o menor grão em que a cauda sai de 1 resposta |
| Marca do concorrente | acumulado (8 sem.) + mensal **sem Δ** | ~5 por semana; nenhuma marca chega a 10 no mês |
| Regional com amostra de verdade | **mensal** (pág. 3) | ~97 respostas por regional, contra ~42 da semana |

`SEMANAS_JANELA = 8` é o que faz os cortes de baixo sustentarem. Diminuir derruba metade das linhas
pelo piso; aumentar mistura períodos operacionais diferentes.

## Regras que não podem quebrar

**`PISO_AMOSTRA = 10`**, herdado do `vw_auditoria`. Recorte abaixo disso vai para cinza (`tr.fraca`)
ou ganha "amostra baixa" na barra — **nunca some do relatório**. Esconder tiraria a lição.

**Vendas perdidas é da amostra, não da rede.** A fórmula (`conversão × quem disse não ter contato`,
+ concorrência) conta sobre os leads **ouvidos pela auditoria**. Por isso o número semanal é pequeno
(3, 6 unidades) e por isso todo rótulo diz "na amostra ouvida". Isso é o número honesto — não
"conserte" multiplicando pelo volume da base.

**A tabela regional não tem colunas de leads/vendas da base.** Elas foram removidas de propósito:
lado a lado com contagens de amostra, convidam exatamente a multiplicação proibida acima.

**"Para quem" entra só em contagem, nunca em tendência.** `marca_ia` (em `vw_volks_auditoria`) tem
~5 marcas nomeadas por semana desde 17/08 — cerca de 2/3 de quem declarou "comprei de outra marca".
Por isso: página 2 dá o ranking da janela de 8 semanas numa frase (`paraQuem()`), mais as marcas
**sem registro antes da semana atual**; página 3 dá a tabela do mês ao lado do mesmo recorte do mês
anterior, **sem Δ e sem seta** — nenhuma marca chega ao piso no mês, "Chevrolet 4 → 6" é ruído.
Três armadilhas pagas:
- **`vw_volks_auditoria` repete contato** (um teve 32 linhas, todas "Fiat Pulse"). A query faz
  `MAX(marca_ia)` por `id_chat_campanha_contato` antes do join — sem isso uma resposta vira o topo.
- **`marca_ia` é extraída por IA**: modelo vira marca (Tiggo) e grafia varia (Cherry, Shagan). O mapa
  `MARCA` em `queries.ts` normaliza; marca nova com erro aparece como linha própria até entrar lá.
- **"Nova" precisa de base.** Na primeira semana da janela, ou no mês sem anterior comparável, toda
  marca pareceria nova — o rótulo some nesses casos.

`ondePerdemos()` continua sem marca (tem teste): motivo e marca têm amostras de tamanhos muito
diferentes e não podem dividir a mesma frase.

**Texto vs. dados.** Todo veredito vem de `narrativa.ts` e tem teste. `pages.ts` só carrega prosa
neutra. As listas "o que está bom/ruim" podem sair **vazias** — é resposta válida e o template
imprime isso, em vez de inventar boa notícia.

## Armadilhas já pagas

- **`tickFormat` recebe `(valor, index)`.** Helper de formatação com segundo parâmetro opcional pega
  o índice do tick como casas decimais (0%, 10,0%, 20,00%…). Já documentado na raiz; custou um ciclo
  de build no `vw_auditoria`.
- **`.kpi .value` é `nowrap` no core.** O delta (▲ 2,8 p.p.) precisa ser **irmão** de `.value`, não
  filho — dentro dele, empurra o número para fora do card.
- **Teto nas listas**: `lista()` corta em 4 itens e `oQueAprendi` em 3. As funções de narrativa
  entregam em ordem de relevância, então o corte é da cauda. Sem o teto, o rodapé vai para a 3ª folha.
- **`.logo` precisa de `white-space: nowrap`** no cabeçalho flex: "Auditoria de Leads" quebrava em
  duas linhas e desalinhava a faixa inteira.
- **`tendencia()` pondera pelo `n`.** A janela tem semanas de mutirão de auditoria (844 respostas
  contra ~90 das vizinhas); média simples deixava uma semana atípica mandar na leitura.

## Não faça

- Multiplicar percentual da amostra por volume da base em nenhuma frase, tabela ou gráfico.
- Recortar por `dt_criacao`. Este relatório corta por `data` (dia da auditoria) — é decisão de
  negócio, não descuido, mesmo que o dashboard faça diferente.
- Ler `vw_volks_leads` (a rede) para compor qualquer número deste relatório.
- Comparar o mês corrente com o **mês fechado** anterior. É sempre o mesmo recorte de dias.
- Desenhar barra/seta zerada quando o período anterior não tem amostra. Ausência não é queda.
- Transformar a lista de piores concessionárias em ranking de desempenho — é diagnóstico de fila,
  e o piso de amostra é o que a torna legítima.
- Passar de 3 páginas.
