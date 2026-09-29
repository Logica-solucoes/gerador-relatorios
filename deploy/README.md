# Deploy — servidor do n8n

O gerador roda como container na mesma rede Docker do n8n. O n8n chama
`POST http://gerador:3000/gerar/<cliente>`; o gerador gera o PDF e publica no portal do cliente.

## Primeira vez

```bash
mkdir -p /opt/gerador-relatorios/env /opt/gerador-relatorios/out
cd /opt/gerador-relatorios
# copie deploy/compose.yaml deste repositório para cá
chown 1000:1000 out            # o container roda como usuário bun (uid 1000)

docker network ls              # ache a rede do container do n8n
docker inspect <container-n8n> --format '{{json .NetworkSettings.Networks}}'

cat > .env <<EOF
GERADOR_TOKEN=$(openssl rand -hex 32)
N8N_NETWORK=<nome da rede>
EOF
chmod 600 .env

docker login -u logicasolucoesanaliticas   # uma vez; token de leitura basta
```

Um arquivo por cliente em `env/<cliente>.env`, com `chmod 600`. Para o semanal VW,
`env/vw_auditoria_semanal.env` com as chaves de `clients/vw_auditoria_semanal/.env.example`
preenchidas para produção (`DB_HOST` do Azure SQL, `DB_TRUST_CERT` vazio, `PORTAL_*`).

## Conferir antes de ligar o n8n

```bash
# 1. banco alcançável e PDF sai (não publica)
docker compose run --rm -e CLIENT=vw_auditoria_semanal --entrypoint bun gerador \
  --env-file=env/vw_auditoria_semanal.env run core/build.ts

# 2. servidor no ar
docker compose up -d && docker compose ps     # STATUS healthy após ~1 min

# 3. de dentro do n8n, semana já publicada à mão (14–20/09) — deve dizer "já publicado"
docker exec <container-n8n> wget -qO- --header "Authorization: Bearer <token>" \
  --post-data '{"hoje":"2026-09-22"}' http://gerador:3000/gerar/vw_auditoria_semanal
```

Falhou o 1 com timeout de conexão? Liberar o IP de saída do servidor no firewall do Azure SQL.

## Atualizar

```bash
cd /opt/gerador-relatorios && docker compose pull && docker compose up -d
```

Versão publicada: `bun run imagem <versão>` na máquina de desenvolvimento, com git limpo.

## Reprocessar uma semana

Mesmo POST com `{"hoje":"AAAA-MM-DD"}` de um dia da semana **seguinte** à que se quer.
Semana já publicada (mesmo título e referência) é pulada — para republicar, apague no portal antes.
