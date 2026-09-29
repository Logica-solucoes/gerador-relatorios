#!/usr/bin/env bash
# Publica a imagem de produção. Uso: bun run imagem 1.0.0
set -euo pipefail
v="${1:?uso: bun run imagem <versão>}"
repo=logicasolucoesanaliticas/logicaprivado

# A imagem leva o código: publicar com mudança sem commit gera versão que não existe no git.
[ -z "$(git status --porcelain)" ] || { echo "git com mudanças pendentes — commite antes"; exit 1; }

docker build --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
  -t "$repo:gerador-relatorios-$v" -t "$repo:gerador-relatorios-latest" .
docker push "$repo:gerador-relatorios-$v"
docker push "$repo:gerador-relatorios-latest"
