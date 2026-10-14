# Logging do servidor e e-mail de falha resumido — design

Data: 2026-10-14. Escopo: `core/server.ts` (o servidor que o n8n chama) e o workflow n8n
`Volks Auditoria Relatório Semanal`. O `build.ts` e os clientes não mudam.

## Problema

Hoje o servidor devolve só as últimas 30 linhas da saída do build, e o log completo fica apenas
no `docker logs` — que some quando o container é recriado (`docker compose pull && up -d`, a
própria rotina de atualização). O e-mail de falha do n8n despeja o JSON do erro inteiro, sem
dizer em que etapa parou.

## Decisões

| Tema | Decisão |
|---|---|
| Biblioteca | `pino` (~1,3 MB com dependências). Já há 4 dependências de runtime, nenhuma nativa |
| Rotação | à mão, sem `pino-roll`: ele puxa `date-fns` (~11 MB) só para nomear arquivo por data |
| Arquivo | `out/logs/AAAA-MM-DD.log`, um por dia, data no fuso do container (`TZ=America/Sao_Paulo`) |
| Retenção | 90 dias. A cada execução apaga os `.log` cujo nome é anterior a hoje − 90 dias |
| Escrita | síncrona (`pino.destination({ dest, sync: true, mkdir: true })`) — container que cai no meio não perde o registro |
| Granularidade | um registro por execução. O `build.ts` continua com `console`; a saída dele vai inteira num campo |
| E-mail | texto `resumo` montado pelo servidor; o n8n só o insere |

## Registro de log

Uma linha JSON do pino por chamada a `POST /gerar/<cliente>` que chega a rodar o build:

| Campo | Conteúdo |
|---|---|
| `level` | `info` (exit 0) ou `error` |
| `id` | id curto da execução: `AAAAMMDD-HHMMSS-xxxx` (4 hex aleatórios). Vai no e-mail para achar o registro |
| `cliente`, `hoje` | o que veio na chamada (`hoje` ausente = `null`) |
| `semana` | da linha `→ semana …` da saída, se houver |
| `exitCode`, `duracaoMs` | do processo filho |
| `etapa`, `erro` | do resumo (abaixo) |
| `saida` | stdout + stderr **completos**, sem corte |

Chamadas recusadas antes do build (400, 401, 404, 409) não geram registro: não houve execução,
e quem recusa já responde o motivo.

## Resumo

Função pura `resumir(saida, exitCode)` em `core/log.ts`:

- **etapa**: a última linha que começa com `→`, sem o prefixo `→ [cliente] ` (ex.: `gerando PDF…`).
- **erro**: a última linha que começa com `error: `, sem o prefixo. Sem essa linha e com exit ≠ 0,
  a última linha não vazia da saída. Exit 0 = sem erro.
- **semana**: o trecho depois de `→ semana ` (ex.: `2026-10-05 a 2026-10-11 · mês …`).

Nada de stack trace no resumo: ele está no `saida` do log.

Testes com saídas reais coletadas no deploy: `Login failed for user 'vw'`, `Invalid object name
'vw_volks_leads_auditados'`, falha do weasyprint, sucesso com `✓ publicado` e com `· já publicado`.

## Contrato HTTP

Resposta de `POST /gerar/<cliente>` passa a ser:

```json
{ "ok": false, "id": "20261019-080001-a3f2", "resumo": "..." }
```

`resumo` é texto pronto para o corpo do e-mail:

```
Cliente: vw_auditoria_semanal
Semana: 2026-10-12 a 2026-10-18 · mês 2026-10-01 a 2026-10-18
Parou em: gerando PDF…
Erro: weasyprint falhou
Duração: 42s
Log completo: out/logs/2026-10-19.log (id 20261019-080001-a3f2)
```

Linhas sem valor (sem semana, sem erro) são omitidas. O campo `log` (últimas 30 linhas) sai.
Status HTTP continua o mesmo: 200 ok, 500 falha. As respostas 400/401/404/409 mantêm o status e
trocam `log` por `resumo` com o motivo (`não autorizado` segue texto puro, como hoje).

## Estrutura

- `core/log.ts`: `resumir()`, `gravar(dir, registro)` (pino no arquivo do dia) e `limpar(dir, hoje)`
  (apaga os mais antigos que 90 dias). Sem estado global.
- `core/server.ts`: `Rodar` passa a devolver `{ exitCode, saida }`; `app(token, rodar, dirLog =
  "out/logs")` mede duração, gera o `id`, chama `resumir`, `gravar`, `limpar` e responde. O
  `console.log` de uma linha por execução continua (é o que aparece no `docker logs`).
- Testes: `core/log.test.ts` (resumo e limpeza num diretório temporário) e `core/server.test.ts`
  ajustado ao novo contrato, com `dirLog` temporário.

## n8n

Workflow `Volks Auditoria Relatório Semanal` (id `vlvtibvkX06nNuxY`):

1. Nó HTTP com `options.response.response.neverError = true`: 500 deixa de ser erro do nó.
2. Nó IF em `{{ $json.ok }}`; falso → e-mail com `{{ $json.resumo }}`.
3. A saída de erro do nó HTTP continua indo ao e-mail, agora para falha de rede (gerador fora,
   timeout), com `{{ $json.error.message }}`.

Destinatários e credencial do e-mail não mudam.

## Ler o log no servidor

Documentado no `deploy/README.md`:

```bash
grep -h '"id":"<id>"' out/logs/*.log | docker compose exec -T gerador \
  bun -e 'console.log(JSON.parse(await Bun.stdin.text()).saida)'
```

## Ordem de entrega

1. Código + testes, `bun run imagem 1.1.0`.
2. No servidor: `docker compose pull && docker compose up -d`.
3. Só então atualizar o workflow n8n — antes disso o servidor antigo não manda `resumo` e o e-mail
   sairia vazio.
4. Conferir com uma chamada que falha de propósito sem publicar: `{"hoje":"2030-01-07"}` — semana
   sem auditoria derruba o build antes do portal. Deve chegar o e-mail com `resumo` e aparecer o
   registro `error` no log do dia.

## Fora do escopo

- Log estruturado dentro do `build.ts`.
- Enviar log para fora do servidor (Loki, Datadog etc.).
- Anexar o log completo ao e-mail.
