# Agendamento e publicação do relatório semanal — design

Data: 2026-09-29. Escopo: `vw_auditoria_semanal` gerado toda segunda pelo n8n e publicado no
portal VwAuditoria. Primeiro deploy de produção do gerador.

## Decisões

| Tema | Decisão |
|---|---|
| Quem agenda | n8n (`webapi.seudash.com.br:15678`), Schedule Trigger |
| Quem gera e publica | o gerador, num processo só; n8n só dispara e alerta |
| Onde o gerador roda | container no servidor do n8n, na mesma rede Docker — sem porta publicada |
| Como chega lá | imagem no Docker Hub `logicasolucoesanaliticas/logicaprivado`, push manual |
| Tag | `gerador-relatorios-<versão>` e `gerador-relatorios-latest` |
| Onde fica o upload | `clients/vw_auditoria_semanal/publicar.ts` — só a VW tem portal hoje; sobe para `core/` quando aparecer o segundo |
| Segregação | cada execução é um subprocesso com o `.env` só daquele cliente |

## 1. Arrumação antes do deploy

A imagem hoje não builda de um clone limpo. Antes de qualquer código novo:

- Commitar as mudanças pendentes de `vw`, `vw_auditoria_semanal`, `core/`, `package.json`.
- Versionar `clients/vw_auditoria/`, `core/dash.png`, `core/vw.png` (o `build.ts` lê os dois PNGs).
- `.gitignore`: `.serena/`. `.dockerignore`: `web/`, `docs/`.
- Renomear `basf-relatorio` → `gerador-relatorios` no `package.json` (`name`) e na imagem local do
  `compose.yaml`. O repositório no GitHub fica como está (fora de escopo).

## 2. Servidor HTTP — `core/server.ts`

`Bun.serve` na porta 3000, sem dependência nova. Uma rota:

```
POST /gerar/:client
Authorization: Bearer <GERADOR_TOKEN>
Body (opcional): {"hoje": "2026-09-29"}
```

- Token errado ou ausente → 401. `:client` que não é pasta em `clients/` ou sem `env/<client>.env` → 404.
- Uma execução por cliente por vez (`Set` em memória). Segunda chamada concorrente → 409.
- Roda `bun --env-file=env/<client>.env run core/build.ts --publicar` com `CLIENT` e `HOJE` (se veio
  no corpo). O subprocesso recebe **só** `PATH`, `HOME`, `XDG_CACHE_HOME`, `TZ`, `CLIENT`, `HOJE` —
  `GERADOR_TOKEN` não vaza para o cliente, e um cliente nunca vê o `.env` de outro.
- Timeout de 5 min: mata o processo e responde erro.
- Resposta quando o processo termina: `200 {ok: true, log}` ou `500 {ok: false, log}`, onde `log` são
  as últimas 30 linhas de stdout+stderr. É o que vai no e-mail de alerta.
- `GET /saude` → 200, para o healthcheck do compose.

`GERADOR_TOKEN` sem default: servidor não sobe sem ele.

## 3. `core/build.ts --publicar`

Depois de gerar o PDF, se o argumento `--publicar` estiver presente, importa
`clients/<id>/publicar.ts` e chama `publicar("out/<id>/relatorio.pdf")`. Cliente sem `publicar.ts`
com `--publicar` → erro (pedir publicação de quem não sabe publicar é bug de configuração). Sem
`--publicar`, nada muda: o loop local de design nunca publica.

## 4. `clients/vw_auditoria_semanal/publicar.ts`

Variáveis no `.env` do cliente, sem default: `PORTAL_URL`, `PORTAL_LOGIN`, `PORTAL_SENHA`.

Campos, seguindo o padrão já publicado à mão no portal (22/09):

| Campo | Valor | Regra |
|---|---|---|
| `titulo` | `Relatório Semanal Auditoria - Semana 4` | N = `ceil(dia do domingo da semana lida / 7)` |
| `assunto` | `Auditoria` | fixo, já cadastrado em `/api/relatorio/assuntos` |
| `referencia` | `Setembro/2026` | mês/ano do domingo da semana lida |
| `arquivoMimeType` | `application/pdf` | |

A semana lida vem de `janela(semanaPassada())`, a mesma do `carregar()` — respeita `HOJE`. Semana que
cruza o mês (28/09–04/10) vira `Outubro/2026` Semana 1, mesma regra da página 3.

Fluxo:

1. `POST /api/login` (multipart `login`, `password`) → `data.accessToken`.
2. `GET /api/relatorio` com Bearer. Já existe item com mesmo `titulo` e `referencia` → loga
   `· já publicado` e retorna sem enviar (n8n pode repetir sem duplicar; também respeita upload manual).
3. `POST /api/relatorio` multipart com Bearer.

Toda resposta é checada por `status === 0` no corpo — o portal devolve erro com HTTP 200 e
`status: 1`. Falha → lança com a mensagem de `error` do portal. `titulo` > 50 ou `referencia` > 30
caracteres → lança antes de enviar (as colunas cortariam com erro genérico).

O Bearer vai mesmo com o portal hoje aceitando sem token: quando a autorização for religada, nada
quebra.

## 5. Imagem — `bun run imagem <versão>`

Script em `package.json` chamando um `.sh` curto:

1. Recusa se `git status --porcelain` não estiver vazio.
2. `docker build` com label `org.opencontainers.image.revision=<sha>`.
3. Tag `gerador-relatorios-<versão>` e `gerador-relatorios-latest`, push das duas.

`Dockerfile`: `CMD` passa a ser `bun run core/server.ts`. O `compose.yaml` de desenvolvimento
continua rodando `core/build.ts` via `command:` — o fluxo local não muda.

## 6. Deploy — `deploy/compose.yaml`

Copiado para o servidor (ex.: `/opt/gerador-relatorios/`), ao lado de `env/`:

```
/opt/gerador-relatorios/
  compose.yaml
  .env                          # GERADOR_TOKEN, N8N_NETWORK
  env/vw_auditoria_semanal.env  # DB_*, PORTAL_*
  out/
```

- Serviço `gerador`, `image: logicasolucoesanaliticas/logicaprivado:gerador-relatorios-latest`,
  `restart: unless-stopped`.
- Sem `ports:`. Rede externa `${N8N_NETWORK}` (descoberta no deploy com `docker network ls`),
  alias `gerador`.
- `env/` montado read-only em `/app/env`, `out/` montado para guardar os PDFs gerados.
- Mesmo endurecimento do compose atual: `cap_drop: [ALL]`, `no-new-privileges`, `read_only`,
  `tmpfs: /tmp`, `mem_limit: 1g`. `TZ=America/Sao_Paulo`.
- Healthcheck em `/saude`.

Atualizar: `docker compose pull && docker compose up -d`.

## 7. Workflow n8n

Criado pelo n8n-mcp:

1. Schedule Trigger: segunda, 06:00, timezone `America/Sao_Paulo`.
2. HTTP Request: `POST http://gerador:3000/gerar/vw_auditoria_semanal`, header Bearer (credencial do
   n8n, não texto no nó), body `{"hoje": "{{ $now.toFormat('yyyy-MM-dd') }}"}`, timeout 6 min,
   "continue on fail".
3. IF `ok !== true` → Send Email para `alexandrescarano@gmail.com` e `rodrigo.otavio@seudash.com.br`
   com o `log`. Usa a credencial SMTP que já existir no n8n; se não existir, criar é passo do deploy.

Passar `hoje` explícito tira o risco de fuso: o container em UTC acharia que domingo 22h já é segunda.

## 8. Testes

`clients/vw_auditoria_semanal/publicar.test.ts`, só a parte pura:
- título/referência para uma semana no meio do mês, uma que cruza o mês e a Semana 3 de 14–20/09
  (tem que bater com o que já está no portal);
- detecção de duplicado sobre uma lista como a devolvida por `GET /api/relatorio`.

Ponta a ponta é manual, no deploy (seção 9).

## 9. Verificação no deploy

1. No servidor: `docker compose run --rm -e CLIENT=vw_auditoria_semanal gerador bun
   --env-file=env/vw_auditoria_semanal.env run core/build.ts` (sem `--publicar`) — confirma que o
   servidor alcança o Azure SQL e que o PDF sai. **Não confirmado ainda**; se não alcançar, liberar o
   IP do servidor no firewall do Azure SQL.
2. `curl` na rota de dentro do container do n8n, com `hoje` de uma semana já publicada (14–20/09) —
   deve responder `já publicado`, sem enviar.
3. Execução manual do workflow no n8n para a semana corrente; conferir o PDF no portal.
4. Forçar falha (token errado no nó) e conferir que o e-mail chega.

## Fora de escopo

- Autorização do portal (`[CoreAuthorize]` comentado no `RelatorioController`: listar, baixar,
  criar e **apagar** relatórios funciona sem login — confirmado para a listagem). Correção é no
  repositório do portal; avisar o Rodrigo.
- Credencial do portal: hoje é `admin/admin` numa aplicação pública. Recomendado criar um usuário
  próprio para o robô e trocar a senha do admin; o gerador só lê do `.env`, troca sem código.
- HTTPS no n8n (`http://` na porta 15678 — chave de API trafega aberta).
- Outros clientes agendados, outros portais, CI.
