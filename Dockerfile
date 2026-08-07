# syntax=docker/dockerfile:1
# Versoes fixas: este container gera um relatorio que precisa ser reproduzivel.
FROM oven/bun:1.3.14-debian

COPY --from=ghcr.io/astral-sh/uv:0.12.3 /uv /usr/local/bin/uv

# libpango/harfbuzz: renderizacao de texto do WeasyPrint.
# poppler-utils: pdftoppm, unico jeito de conferir o PDF gerado (ver CLAUDE.md).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libffi8 \
      poppler-utils \
 && rm -rf /var/lib/apt/lists/*

# Tudo em /opt, inclusive o interpretador: por padrao o uv baixa um CPython para
# /root/.local/share/uv/python e o venv aponta para la — /root e' 0700 e a
# execucao falha com "Permission denied" depois do USER bun.
ENV UV_TOOL_DIR=/opt/uv-tools \
    UV_TOOL_BIN_DIR=/opt/bin \
    UV_PYTHON_INSTALL_DIR=/opt/python \
    PATH="/opt/bin:$PATH"
RUN uv tool install weasyprint==69.0 && chmod -R a+rX /opt

WORKDIR /app

# Deps antes do codigo: mudar um .ts nao invalida o bun install.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY --chown=bun:bun build.ts queries.ts report.ts pages.ts narrativa.ts styles.css ./
COPY --chown=bun:bun fonts ./fonts
RUN mkdir -p /app/out && chown bun:bun /app/out

# Cache do fontconfig em /tmp (tmpfs no compose): com rootfs read-only qualquer
# outro caminho gera "No writable cache directories".
ENV HOME=/home/bun \
    XDG_CACHE_HOME=/tmp/.cache
USER bun

# Sem HEALTHCHECK de proposito: job em batch que roda e sai — o exit code e' o sinal.
CMD ["bun", "run", "build.ts"]
