// Publica a imagem de produção. Uso: bun run imagem 1.0.0
// Bun Shell e não bash: no PowerShell, `bash` cai no WSL, que vê o repo inteiro como modificado (CRLF).
import { $ } from "bun";

const v = process.argv[2];
if (!v) throw new Error("uso: bun run imagem <versão>");
const repo = "logicasolucoesanaliticas/logicaprivado";
const [tag, latest] = [`${repo}:gerador-relatorios-${v}`, `${repo}:gerador-relatorios-latest`];

// A imagem leva o código: publicar com mudança sem commit gera versão que não existe no git.
if ((await $`git status --porcelain`.text()).trim()) throw new Error("git com mudanças pendentes — commite antes");
const rev = (await $`git rev-parse HEAD`.text()).trim();

await $`docker build --label ${"org.opencontainers.image.revision=" + rev} -t ${tag} -t ${latest} .`;
await $`docker push ${tag}`;
await $`docker push ${latest}`;
