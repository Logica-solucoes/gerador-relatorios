# Dashboards SHIFT BI no portal Basf — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar os dois dashboards de `web/basf/` (BI Mercado e Sales) para o portal Basf como páginas nativas, ao lado dos dois Power BI que continuam lá — 4 itens na pasta SHIFT BI.

**Architecture:** Mesmo caminho do Momentive no LogicaDash (`masterAlexandreBFM`): código do lab copiado para o front Aurelia, um componente fino que chama `montarDashboard`, rota e menu por script SQL, endpoint .NET com `[CoreAuthorize]`. Dados pela opção (b): cada recurso do snapshot vira uma tabela `basf_dash_<recurso>` no banco do portal, carregada por script a partir de `web/basf/dados/*.json`; o endpoint só faz `SELECT` e devolve no formato `TabelaFio` (`{c, r}`).

**Tech Stack:** Aurelia 1 + webpack 5 + TS 4.9 (`LogicaBasfFront`), .NET 6 + ADO.NET via `IConnManager` (`LogicaBasfBack`), SQL Server / Azure SQL, Bun + `mssql` (script de carga no lab), `@observablehq/plot` + `d3-array`.

---

## Decisões (usuário, 2026-10-06)

| # | Decisão |
|---|---|
| 1 | Dados do Mercado: tabelas no formato final do snapshot, carregadas por script. Importação pelo `etl_mapping` fica para quando a BASF precisar atualizar sozinha. |
| 2 | Sales vai pelo mesmo caminho: `vendas` também é snapshot (não lê `basf_vendas` ao vivo). Venda nova só aparece depois de rodar snapshot + carga. |
| 3 | `meta` (budget, forecast, taxa R$/€, `ultimaVenda`) vira `basf_dash_meta`, igual aos outros. A `basf_meta_anual` da spec antiga não existe e sai do plano. |
| 4 | Mesmas permissões dos PBI: Mercado = permissão 58 (módulo "DASH BI BASF", programa 18), Sales = 67 (módulo "Vendas", programa 26). |
| 5 | Menus novos "BI Mercado (novo)" e "Sales (novo)", posições 26 e 27, dentro da SHIFT BI, depois dos dois antigos (89 e 94 ficam intactos). |
| 6 | Estado dos filtros **não** persiste no portal (nada de hash na URL). |
| 7 | Rota e menu por script SQL versionado + rollback. |

## Fatos do portal que moldam o plano (verificados)

- **`[CoreAuthorize("DASH BI BASF", 0)]` não funciona:** a policy é `"<módulo> <n> <dinâmico>"` separada por espaço (`CoreAuthorizationPolicyProvider.GetPolicyAsync` faz `Split(' ')`), e o nome do módulo tem espaço → `Convert.ToUInt16("BI")` estoura. Por isso o endpoint usa o `[CoreAuthorize]` **dinâmico**, o mesmo do `DashController` dos PBI: lê `idProgram` da rota e checa a permissão do programa (18 → 58, 26 → 67).
- **`RequestHelper.request` não serve:** ele passa por `json-bigint` com `useNativeBigInt`, que chama `BigInt("1234.5678901234567")` para todo número com mais de 15 caracteres e lança `SyntaxError`. O snapshot tem 1.894 números assim. O front busca com `RequestHelper.getHttpClient().fetch` (já põe o Bearer) + `resp.json()`.
- **`tsconfig` do portal tem `lib: ["es2015","dom"]` e `target: es5`.** O código do lab compilado com essas opções dá 71 erros (`includes`, `Object.entries/fromEntries`, `flatMap`, `at`, `Object.hasOwn`, `finally`, spread de `Set`/`Map`). Com `lib: ["es2022","dom","dom.iterable"]` + `downlevelIteration: true` dá 0. Testado com o `tsc` 4.9.4 do portal.
- **Router com `pushState: true`** (`app.ts:121`). O lab grava estado em `location.hash` via `history.replaceState` — por isso o parâmetro `usarHash` (Task 1).
- **`core_route` não tem sequence** (máx. local = 19); `core_menu` usa `sq_core_menu`. Rotas e menus só aparecem após novo login (ficam no JWT/no carregamento do `app.ts`).
- **Push na `master` do repo Basf faz deploy na Azure** (`.github/workflows/master_portalbasf.yml`). Todo trabalho no Basf vai na branch `feat/shift-bi-dashboards`; merge/push só na Task 8, com confirmação do usuário.
- O dev server do front não tem proxy para a API: teste ponta a ponta = `npm run build` → `copytoprod.sh` → back em https://localhost:5001.

## Mapa de arquivos

**Gerador-Relatorios (este repo, `master`):**
- Modify: `web/basf/src/dashboard.ts` — parâmetro `usarHash`.
- Create: `web/basf/snapshot/banco.ts` — `dados/*.json` → `basf_dash_*`, com conferência ida-e-volta.
- Modify: `package.json` — script `dash:basf:banco`.

**Basf (`C:\Users\floppydisk\Documents\Trabalho\Basf`, branch `feat/shift-bi-dashboards`):**
- Create: `LogicaBasfBack/migrations/001_shift_bi_dashboards.sql`, `LogicaBasfBack/migrations/rollback_001.sql`.
- Modify: `LogicaBasfBack/src/basf/controllers/BasfDashboardController.cs` — action `GetShiftData`.
- Modify: `LogicaBasfBack/Startup.cs` — compressão de resposta (o `ibge` tem ~3,6 MB em JSON).
- Modify: `LogicaBasfFront/package.json`, `LogicaBasfFront/package-lock.json` — Plot + d3-array.
- Modify: `LogicaBasfFront/tsconfig.json` — lib/downlevelIteration.
- Create: `LogicaBasfFront/src/basf/dashboards/shift/**` — cópia de `web/basf/src` (sem testes nem previews) + `shift-dashboard.ts/.html`.
- Modify: `LogicaBasfFront/src/includes.ts` — registra o módulo.

## Ordem e paralelismo

- Lote 1 (paralelo): Task 1, Task 3, Task 4, Task 5.
- Lote 2: Task 2 (precisa das tabelas da Task 3 no banco local), Task 6 (precisa da 1 e da 5).
- Lote 3: Task 7 (verificação ponta a ponta, parte manual com o usuário).
- Task 8 (produção) **só com ordem explícita do usuário**.

---

### Task 1: `montarDashboard` sem hash (lab)

**Files:**
- Modify: `web/basf/src/dashboard.ts`

- [ ] **Step 1: Trocar a assinatura e os dois usos de hash**

Em `web/basf/src/dashboard.ts`, troque:

```ts
export function montarDashboard(host: HTMLElement, carregar: Carregar, painel: Painel): Montado {
  const shell = criarShell(host, gabarito(painel.titulo));
  let estado: Estado = deHash(location.hash, painel.abas.map((a) => a.id));
```

por:

```ts
/** `usarHash = false` no portal: o router do Aurelia é dono da URL e o estado não persiste. */
export function montarDashboard(host: HTMLElement, carregar: Carregar, painel: Painel, usarHash = true): Montado {
  const shell = criarShell(host, gabarito(painel.titulo));
  let estado: Estado = deHash(usarHash ? location.hash : "", painel.abas.map((a) => a.id));
```

E em `mudar`, troque:

```ts
    history.replaceState(null, "", paraHash(estado));
```

por:

```ts
    if (usarHash) history.replaceState(null, "", paraHash(estado));
```

- [ ] **Step 2: Testes e build do preview**

Run: `bun test web/basf && bun run dash:basf && bun run dash:basf:sales && bunx tsc --noEmit`
Expected: todos os testes passam, os dois builds geram `web/basf/dist/*.js`, `tsc` sem erro.

- [ ] **Step 3: Conferir que o preview continua guardando estado**

Run: `bun run dash:basf:serve` e abra http://localhost:4173/#comparativo — tem que abrir na aba Comparativo; troque de aba e confira que o hash muda. Pare o servidor.

- [ ] **Step 4: Commit**

```bash
git add web/basf/src/dashboard.ts
git commit -m "feat(basf-dash): montarDashboard aceita rodar sem hash na url"
```

---

### Task 2: Carga do snapshot no banco do portal (lab)

Depende da Task 3 já ter criado as tabelas no banco local.

**Files:**
- Create: `web/basf/snapshot/banco.ts`
- Modify: `package.json` (bloco `scripts`)

- [ ] **Step 1: Escrever `banco.ts`**

```ts
/**
 * dados/*.json → tabelas basf_dash_* do banco do portal Basf. O portal só lê essas tabelas.
 * Uso: PORTAL_DB=Basf bun run dash:basf:banco
 * PORTAL_DB não tem default de propósito: este script apaga e regrava, e também roda contra a Azure.
 */
import sql from "mssql";
import type { TabelaFio } from "../src/types";

const RECURSOS = ["basf", "ibge", "abcsem", "cepea", "resumo", "resumoSeg", "clientes", "vendas", "meta", "municipios"];
const AQUI = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`${n} não definida`); return v; };

const pool = await sql.connect({
  server: req("DB_HOST"), user: req("DB_USER"), password: req("DB_PASS"), database: req("PORTAL_DB"),
  options: { encrypt: true, trustServerCertificate: process.env.DB_TRUST_CERT === "true" },
  requestTimeout: 120_000,
});
const tx = new sql.Transaction(pool);
await tx.begin();
try {
  for (const r of RECURSOS) {
    const t = (await Bun.file(`${AQUI}../dados/${r}.json`).json()) as TabelaFio;
    const tabela = `basf_dash_${r}`;
    const cols = t.c.map((c) => `[${c}]`).join(", ");
    // TOP 0 traz os tipos das colunas do banco; o bulk usa eles.
    const molde = (await new sql.Request(tx).query(`SELECT TOP 0 ${cols} FROM ${tabela}`)).recordset.toTable(tabela);
    for (const linha of t.r) molde.rows.add(...linha);
    await new sql.Request(tx).query(`DELETE FROM ${tabela}`);
    await new sql.Request(tx).bulk(molde);

    // Ida e volta: o que o endpoint vai ler tem que ser igual ao snapshot, valor a valor e na ordem.
    const volta = (await new sql.Request(tx).query(`SELECT ${cols} FROM ${tabela} ORDER BY id`)).recordset;
    if (volta.length !== t.r.length) throw new Error(`${r}: ${volta.length} linhas no banco, ${t.r.length} no snapshot`);
    t.r.forEach((linha, i) => {
      const lida = t.c.map((c) => volta[i][c]);
      if (JSON.stringify(lida) !== JSON.stringify(linha)) throw new Error(`${r}, linha ${i}: ${JSON.stringify(lida)} ≠ ${JSON.stringify(linha)}`);
    });
    console.log(`${r}: ${volta.length} linhas`);
  }
  await tx.commit();
} catch (e) {
  await tx.rollback();
  throw e;
} finally {
  await pool.close();
}
```

- [ ] **Step 2: Script no `package.json`**

Adicione ao bloco `scripts`, logo depois de `dash:basf:snapshot`:

```json
"dash:basf:banco": "bun --env-file=clients/basf/.env run web/basf/snapshot/banco.ts",
```

- [ ] **Step 3: Rodar contra o banco local**

Run (bash): `PORTAL_DB=Basf bun run dash:basf:banco`
Expected: 10 linhas `<recurso>: N linhas`, com N = basf 4200, ibge 59062, abcsem 1937, cepea 6834, resumo 262, resumoSeg 854, clientes 431, vendas 4129, meta 5, municipios 5291 (os números mudam se o snapshot for refeito; têm que bater com `dados/*.json`).

Se der erro de conexão em `localhost:1433`: ver a nota de WinNAT no README do `web/basf` (faixa 1424–1523 reservada) — mesmo contorno do snapshot.

Se a conferência ida-e-volta falhar por ordem (bulk fora da ordem de inserção), **pare e reporte** — não troque o `ORDER BY id` por outra coisa sem decidir com o usuário.

- [ ] **Step 4: Rodar de novo (idempotência)**

Run: `PORTAL_DB=Basf bun run dash:basf:banco`
Expected: mesma saída; nada duplica.

- [ ] **Step 5: Commit**

```bash
git add web/basf/snapshot/banco.ts package.json
git commit -m "feat(basf-dash): carga do snapshot nas tabelas basf_dash_* do portal"
```

---

### Task 3: Tabelas, rota e menus (Basf, SQL)

**Files:**
- Create: `LogicaBasfBack/migrations/001_shift_bi_dashboards.sql`
- Create: `LogicaBasfBack/migrations/rollback_001.sql`

- [ ] **Step 1: Branch no repo Basf**

```bash
cd C:/Users/floppydisk/Documents/Trabalho/Basf
git switch master && git pull --ff-only
git switch -c feat/shift-bi-dashboards
```

Não mexa no `LogicaBasfFront/package-lock.json` modificado nem nos não rastreados (`.netcoredbg/`, `mise.toml`) — já estavam assim; não entram em commit nenhum deste plano (exceto o lock da Task 5, que regenera o arquivo).

- [ ] **Step 2: Escrever `001_shift_bi_dashboards.sql`**

Regra de tipos: `ano`, `mes`, `dia`, `cod`, `selecionado` são `int`; toda outra coluna numérica é `float` (cópia exata do double do snapshot); texto é `nvarchar(200)`. Nomes de coluna em camelCase, iguais ao fio — o endpoint devolve o nome da coluna sem mapear. `id` identity só serve para ordem e chave clusterizada (a Azure SQL exige).

```sql
-- Dashboards SHIFT BI nativos (BI Mercado e Sales) ao lado dos PBI.
-- Tabelas basf_dash_*: cópia do snapshot do Gerador-Relatorios (web/basf/snapshot/banco.ts).
SET XACT_ABORT ON;
BEGIN TRAN;

IF NOT EXISTS (SELECT 1 FROM core_menu WHERE id_menu = 89 AND id_permission = 58 AND route_params = 'idProgram=18')
   OR NOT EXISTS (SELECT 1 FROM core_menu WHERE id_menu = 94 AND id_permission = 67 AND route_params = 'idProgram=26')
   THROW 50000, 'Menus 89/94 não batem com os programas 18/26: confira os ids deste banco antes de rodar.', 1;
IF EXISTS (SELECT 1 FROM core_route WHERE route_name = 'dashboard-shift')
   THROW 50000, 'Rota dashboard-shift já existe.', 1;
IF EXISTS (SELECT 1 FROM core_menu WHERE position IN (26, 27))
   THROW 50000, 'Posições 26/27 do menu já estão ocupadas.', 1;

CREATE TABLE basf_dash_basf (id int IDENTITY PRIMARY KEY, ano int NULL, uf nvarchar(200) NULL, cod int NULL, municipio nvarchar(200) NULL, hotspot nvarchar(200) NULL, regional nvarchar(200) NULL, rtv nvarchar(200) NULL, crop nvarchar(200) NULL, cropDesc nvarchar(200) NULL, segmento nvarchar(200) NULL, hy nvarchar(200) NULL, area float NULL, dose float NULL, th float NULL, potencial float NULL, potencialEur float NULL);
CREATE TABLE basf_dash_ibge (id int IDENTITY PRIMARY KEY, nivel nvarchar(200) NULL, ano int NULL, especie nvarchar(200) NULL, uf nvarchar(200) NULL, meso nvarchar(200) NULL, cod int NULL, nome nvarchar(200) NULL, area float NULL);
CREATE TABLE basf_dash_abcsem (id int IDENTITY PRIMARY KEY, ano int NULL, especie nvarchar(200) NULL, tipo nvarchar(200) NULL, segmento nvarchar(200) NULL, crop nvarchar(200) NULL, selecionado int NULL, area float NULL, volume float NULL, valor float NULL);
CREATE TABLE basf_dash_cepea (id int IDENTITY PRIMARY KEY, ano int NULL, safra nvarchar(200) NULL, regiao nvarchar(200) NULL, uf nvarchar(200) NULL, estado nvarchar(200) NULL, regional nvarchar(200) NULL, produto nvarchar(200) NULL, item nvarchar(200) NULL, area float NULL);
CREATE TABLE basf_dash_resumo (id int IDENTITY PRIMARY KEY, fonte nvarchar(200) NULL, ano int NULL, especie nvarchar(200) NULL, area float NULL, th float NULL);
CREATE TABLE basf_dash_resumoSeg (id int IDENTITY PRIMARY KEY, fonte nvarchar(200) NULL, ano int NULL, especie nvarchar(200) NULL, segmento nvarchar(200) NULL, hy nvarchar(200) NULL, crop nvarchar(200) NULL, area float NULL, th float NULL);
CREATE TABLE basf_dash_clientes (id int IDENTITY PRIMARY KEY, cliente nvarchar(200) NULL, crop nvarchar(200) NULL, hotspot nvarchar(200) NULL, rtv nvarchar(200) NULL, regional nvarchar(200) NULL, acesso nvarchar(200) NULL, ano int NULL, area float NULL, dose float NULL, mercado float NULL, copa float NULL, enxertia float NULL, vendasEnx float NULL, mercadoCopaEnx float NULL, potencial float NULL, vendasPotencial float NULL);
CREATE TABLE basf_dash_vendas (id int IDENTITY PRIMARY KEY, ano int NULL, mes int NULL, dia int NULL, crop nvarchar(200) NULL, variedade nvarchar(200) NULL, rtv nvarchar(200) NULL, regional nvarchar(200) NULL, cliente nvarchar(200) NULL, hotspot nvarchar(200) NULL, segmento nvarchar(200) NULL, valor float NULL, th float NULL);
CREATE TABLE basf_dash_meta (id int IDENTITY PRIMARY KEY, ano int NULL, budget float NULL, forecast float NULL, taxa float NULL, ultimaVenda nvarchar(200) NULL);
CREATE TABLE basf_dash_municipios (id int IDENTITY PRIMARY KEY, cod int NULL, nome nvarchar(200) NULL, uf nvarchar(200) NULL, lat float NULL, lon float NULL);

-- core_route não tem sequence.
DECLARE @idRoute int = (SELECT MAX(id_route) + 1 FROM core_route);
INSERT core_route (id_route, route_name, route_path, module_id, title, settings)
VALUES (@idRoute, 'dashboard-shift', '/dashboard/shift/:idProgram', './basf/dashboards/shift/shift-dashboard', 'SHIFT BI', NULL);

-- Mesmas permissões e programas dos PBI (89 e 94): quem vê o antigo vê o novo.
INSERT core_menu (id_menu, position, level, menu, icon, id_permission, id_route, route_params, anchor)
VALUES (NEXT VALUE FOR sq_core_menu, 26, 1, 'BI Mercado (novo)', 'insert_chart', 58, @idRoute, 'idProgram=18', NULL);
INSERT core_menu (id_menu, position, level, menu, icon, id_permission, id_route, route_params, anchor)
VALUES (NEXT VALUE FOR sq_core_menu, 27, 1, 'Sales (novo)', 'sell', 67, @idRoute, 'idProgram=26', NULL);

COMMIT;
```

- [ ] **Step 3: Escrever `rollback_001.sql`**

```sql
SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @idRoute int = (SELECT id_route FROM core_route WHERE route_name = 'dashboard-shift');
DELETE FROM core_menu WHERE id_route = @idRoute;
DELETE FROM core_route WHERE id_route = @idRoute;
DROP TABLE IF EXISTS basf_dash_basf, basf_dash_ibge, basf_dash_abcsem, basf_dash_cepea, basf_dash_resumo,
   basf_dash_resumoSeg, basf_dash_clientes, basf_dash_vendas, basf_dash_meta, basf_dash_municipios;
COMMIT;
```

- [ ] **Step 4: Rodar no banco local, testar rollback, rodar de novo**

A senha do `sa` local está na connection string do `.vscode/launch.json` (config ".NET Core Launch (web)"). Não imprima a senha.

```bash
cd C:/Users/floppydisk/Documents/Trabalho/Basf
PW=$(grep -o 'Initial Catalog=Basf; User Id=sa;Password=[^;]*' .vscode/launch.json | head -1 | sed 's/.*Password=//')
sqlcmd -S localhost -U sa -P "$PW" -d Basf -b -i LogicaBasfBack/migrations/001_shift_bi_dashboards.sql
sqlcmd -S localhost -U sa -P "$PW" -d Basf -W -Q "SELECT id_menu,position,level,menu,id_permission,id_route,route_params FROM core_menu WHERE position BETWEEN 23 AND 27 ORDER BY position; SELECT * FROM core_route WHERE route_name='dashboard-shift'"
sqlcmd -S localhost -U sa -P "$PW" -d Basf -b -i LogicaBasfBack/migrations/rollback_001.sql
sqlcmd -S localhost -U sa -P "$PW" -d Basf -b -i LogicaBasfBack/migrations/001_shift_bi_dashboards.sql
```

Expected: menus 88, 89, 94 + dois novos nas posições 26/27, level 1, permissões 58/67, `route_params` `idProgram=18`/`idProgram=26`; rota `dashboard-shift` com id 20 (local). Rodar o script uma segunda vez sem rollback tem que falhar com "Rota dashboard-shift já existe." e não alterar nada.

- [ ] **Step 5: Commit (na branch `feat/shift-bi-dashboards`)**

```bash
git add LogicaBasfBack/migrations/001_shift_bi_dashboards.sql LogicaBasfBack/migrations/rollback_001.sql
git commit -m "feat(shift-bi): tabelas basf_dash_*, rota e menus dos dashboards nativos"
```

---

### Task 4: Endpoint de dados (Basf, back)

**Files:**
- Modify: `LogicaBasfBack/src/basf/controllers/BasfDashboardController.cs`
- Modify: `LogicaBasfBack/Startup.cs`

- [ ] **Step 1: Action `GetShiftData`**

No topo do arquivo, adicione `using System.Linq;` junto dos outros `using`. Dentro da classe `BasfDashboardController`, depois de `GetCompaignData`, adicione:

```csharp
   // Programas dos menus SHIFT BI → recursos que cada um pode ler. O Sales só usa vendas e meta.
   private static readonly Dictionary<int, string[]> RecursosShift = new()
   {
      [18] = new[] { "basf", "ibge", "abcsem", "cepea", "resumo", "resumoSeg", "clientes", "vendas", "meta", "municipios" },
      [26] = new[] { "vendas", "meta" },
   };

   // [CoreAuthorize] dinâmico: checa a permissão do idProgram da rota (18 → 58, 26 → 67).
   // A forma ("módulo", n) não serve: o módulo "DASH BI BASF" tem espaço e a policy é separada por espaço.
   [HttpGet("shift/{idProgram}/{recurso}")]
   [CoreAuthorize]
   public string GetShiftData(int idProgram, string recurso)
   {
      BasicResponse br = new();

      try
      {
         if (!RecursosShift.TryGetValue(idProgram, out string[] recursos) || !recursos.Contains(recurso))
            throw new Exception($"Recurso '{recurso}' não existe neste dashboard.");

         List<string> colunas = new();
         List<object[]> linhas = new();

         DbConnection connection = IConnManager.GetConnManager().GetConnection();
         using DbCommand command = connection.CreateCommand();
         // recurso vem da lista acima, nunca direto do usuário.
         command.CommandText = $"SELECT * FROM basf_dash_{recurso} ORDER BY id;";

         using DbDataReader dr = command.ExecuteReader();
         List<int> indices = new();
         for (int i = 0; i < dr.FieldCount; i++)
         {
            if (dr.GetName(i) == "id") continue;
            indices.Add(i);
            colunas.Add(dr.GetName(i));
         }

         while (dr.Read())
            linhas.Add(indices.Select(i => dr.IsDBNull(i) ? null : dr.GetValue(i)).ToArray());

         br.Status = 0;
         br.Data = new Dictionary<string, object> { ["c"] = colunas, ["r"] = linhas };
      }
      catch (Exception e)
      {
         br.SetBasicError(e);
      }
      finally
      {
         IConnManager.GetConnManager().ReleaseConnection();
      }

      return br.ToString();
   }
```

Formato `{c, r}` em vez de lista de dicionários: é o `TabelaFio` do lab (o front reaproveita `expandir`), e arrays não ganham `$id` do `PreserveReferencesHandling.Objects`.

- [ ] **Step 2: Compressão de resposta**

Em `LogicaBasfBack/Startup.cs`, no `ConfigureServices`, logo depois de `services.AddHttpContextAccessor();`:

```csharp
         services.AddResponseCompression(o => o.EnableForHttps = true);
```

No `Configure`, como primeira linha depois do bloco `if (env.IsDevelopment()) { ... }`:

```csharp
         app.UseResponseCompression();
```

- [ ] **Step 3: Build**

Run: `cd C:/Users/floppydisk/Documents/Trabalho/Basf && mise exec -- dotnet build LogicaBasfBack/LogicaBasfBack.sln`
Expected: `Build succeeded`, 0 erros (warnings pré-existentes podem aparecer; compare com um `dotnet build` antes da mudança se houver dúvida).

- [ ] **Step 4: Commit**

```bash
git add LogicaBasfBack/src/basf/controllers/BasfDashboardController.cs LogicaBasfBack/Startup.cs
git commit -m "feat(shift-bi): endpoint de dados dos dashboards nativos e compressao de resposta"
```

---

### Task 5: Dependências e tsconfig (Basf, front)

**Files:**
- Modify: `LogicaBasfFront/package.json`, `LogicaBasfFront/package-lock.json`
- Modify: `LogicaBasfFront/tsconfig.json`

O front usa `npm` (tem `package-lock.json` e o CI roda `npm install`) — não troque por bun aqui.

- [ ] **Step 1: Linha de base do `tsc`**

```bash
cd C:/Users/floppydisk/Documents/Trabalho/Basf/LogicaBasfFront
npx tsc --noEmit -p . 2>&1 | grep -c "error TS" > /tmp/tsc-antes.txt; cat /tmp/tsc-antes.txt
```

Anote o número (pode não ser zero — são erros pré-existentes).

- [ ] **Step 2: Instalar**

Run: `npm install @observablehq/plot@^0.6.17 d3-array@^3.2.4`
Expected: as duas entram em `dependencies`. O `package-lock.json` já estava modificado antes (npm tinha tirado `chartjs-plugin-datalabels`); confira com `git diff package.json` que o `package.json` só ganhou essas duas linhas.

- [ ] **Step 3: `tsconfig.json`**

Troque:

```json
    "lib": [
      "es2015",
      "dom"
    ],
```

por:

```json
    "lib": [
      "es2022",
      "dom",
      "dom.iterable"
    ],
    "downlevelIteration": true,
```

`lib` só muda tipos; `downlevelIteration` faz spread/for-of de `Set`/`Map` funcionar com `target: es5` (helpers vêm do `tslib` 2.4.1, já instalado, `importHelpers: true`).

- [ ] **Step 4: Conferir que nada piorou**

```bash
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
```

Expected: número **menor ou igual** ao da linha de base. Se aumentou, liste os erros novos e pare.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore(front): adiciona @observablehq/plot e d3-array, lib es2022 no tsconfig"
```

---

### Task 6: Componente Aurelia (Basf, front)

Depende das Tasks 1 e 5.

**Files:**
- Create: `LogicaBasfFront/src/basf/dashboards/shift/**` (cópia do lab)
- Create: `LogicaBasfFront/src/basf/dashboards/shift/shift-dashboard.ts`
- Create: `LogicaBasfFront/src/basf/dashboards/shift/shift-dashboard.html`
- Modify: `LogicaBasfFront/src/includes.ts`

- [ ] **Step 1: Copiar o código do lab**

```bash
LAB=C:/Users/floppydisk/Documents/Trabalho/Gerador-Relatorios/web/basf/src
DST=C:/Users/floppydisk/Documents/Trabalho/Basf/LogicaBasfFront/src/basf/dashboards/shift
mkdir -p "$DST"
cp -r "$LAB"/* "$DST"/
find "$DST" -name "*.test.ts" -delete
rm "$DST/preview.ts" "$DST/preview-sales.ts"
git -C C:/Users/floppydisk/Documents/Trabalho/Gerador-Relatorios log -1 --format=%h -- web/basf/src
```

Anote o hash impresso (é a origem da cópia, vai no comentário do Step 2). Confira que não sobrou nada de `bun:test`: `grep -rn "bun:" "$DST"` → sem saída.

- [ ] **Step 2: `shift-dashboard.ts`**

Troque `<hash>` pelo hash anotado.

```ts
// Código desta pasta é cópia de Gerador-Relatorios/web/basf/src (<hash>); mudança de dashboard nasce lá.
import { autoinject } from "aurelia-framework";
import { activationStrategy } from "aurelia-router";
import { RequestHelper, ResponseStatusCode } from "helpers/request-helper";
import { expandir } from "./carregar";
import { montarDashboard, type Montado } from "./dashboard";
import { MERCADO, SALES, type Painel } from "./paineis";
import type { Carregar, TabelaFio } from "./types";

// idProgram vem do route_params do menu: os mesmos programas dos PBI (89 → 18, 94 → 26).
const PAINEIS: Record<string, Painel> = { "18": MERCADO, "26": SALES };

// Fetch direto em vez de RequestHelper.request: o json-bigint dele vira BigInt (e lança)
// em número com mais de 15 caracteres, e o snapshot tem floats assim.
const carregarApi = (idProgram: string): Carregar => async (r) => {
  const resp = await RequestHelper.getHttpClient().fetch(`/api/dashboard/shift/${idProgram}/${r}`);
  if (resp.status === 403) throw new Error("Você não possui acesso a esta funcionalidade.");
  if (!resp.ok) throw new Error(`${r}: HTTP ${resp.status}`);
  const br = await resp.json();
  if (ResponseStatusCode.error(br.status)) throw new Error(br.error);
  return expandir(br.data as TabelaFio);
};

@autoinject
export class ShiftDashboard {
  private host: HTMLElement;
  private idProgram: string;
  private dash: Montado = null;

  public activate(params: { idProgram: string }): void {
    this.idProgram = params.idProgram;
  }

  // Os dois menus usam a mesma rota: sem replace, trocar de um para o outro não remonta.
  public determineActivationStrategy(): string {
    return activationStrategy.replace;
  }

  public attached(): void {
    const painel = PAINEIS[this.idProgram];
    if (!painel) {
      this.host.textContent = `Dashboard ${this.idProgram} não existe.`;
      return;
    }
    this.dash = montarDashboard(this.host, carregarApi(this.idProgram), painel, false);
  }

  public detached(): void {
    this.dash?.destruir();
    this.dash = null;
  }
}
```

Sem `loader.lock()`: o próprio dashboard mostra skeleton enquanto carrega, e travar o loader global esconderia o host (largura 0 no primeiro desenho — o problema que o BFM resolveu no `medir()`).

- [ ] **Step 3: `shift-dashboard.html`**

```html
<template>
  <require from="./shared/estilo.css"></require>
  <require from="./dashboard.css"></require>
  <div ref="host" style="background: #FBF7F1; min-height: 100%;"></div>
</template>
```

Ordem dos `require` importa: base (`estilo.css`) antes do tema (`dashboard.css`). O fundo creme é o mesmo do `body` dos previews do lab.

- [ ] **Step 4: Registrar o módulo**

Em `LogicaBasfFront/src/includes.ts`, logo depois de `PLATFORM.moduleName("./basf/dashboards/campaign-dashboard");`:

```ts
PLATFORM.moduleName("./basf/dashboards/shift/shift-dashboard");
```

O caminho tem que ser idêntico ao `module_id` da rota da Task 3 (`./basf/dashboards/shift/shift-dashboard`).

- [ ] **Step 5: Tipos e build**

```bash
cd C:/Users/floppydisk/Documents/Trabalho/Basf/LogicaBasfFront
npx tsc --noEmit -p . 2>&1 | grep "dashboards/shift" ; npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
npm run build
```

Expected: nenhum erro em `dashboards/shift`; contagem total igual à da Task 5 Step 4; `npm run build` termina sem `ERROR` e gera `dist/`.

- [ ] **Step 6: Commit**

```bash
git add src/basf/dashboards/shift src/includes.ts
git commit -m "feat(shift-bi): dashboards bi mercado e sales como componente aurelia"
```

---

### Task 7: Verificação ponta a ponta (local)

Depende de todas as anteriores. Parte é manual (login no portal): faça os passos automáticos e passe o checklist ao usuário.

- [ ] **Step 1: Dados no banco local**

Se a Task 2 rodou antes de alguma mudança no snapshot, rode de novo: `PORTAL_DB=Basf bun run dash:basf:banco` (no Gerador-Relatorios).

- [ ] **Step 2: Front no `wwwroot`**

```bash
cd C:/Users/floppydisk/Documents/Trabalho/Basf/LogicaBasfFront
npm run build && bash copytoprod.sh
```

- [ ] **Step 3: Subir o back com o ambiente do `launch.json`**

```bash
cd C:/Users/floppydisk/Documents/Trabalho/Basf/LogicaBasfBack
eval "$(bun -e 'const j = Bun.JSONC.parse(await Bun.file("../.vscode/launch.json").text()); for (const [k, v] of Object.entries(j.configurations[0].env)) console.log(`export ${k}=${"\x27" + String(v).replaceAll("\x27", "\x27\\\x27\x27") + "\x27"}`)')"
mise exec -- dotnet run
```

Rode em background. Expected: `Now listening on: https://localhost:5001`.

- [ ] **Step 4: Checklist (usuário, no navegador em https://localhost:5001, depois de deslogar e logar)**

1. Pasta SHIFT BI com 4 itens, nesta ordem: Dashboard BI Mercado, Dashboard Sales, BI Mercado (novo), Sales (novo).
2. Os dois antigos continuam abrindo o PBI.
3. "BI Mercado (novo)" abre com as 4 abas; KPIs e gráficos iguais ao preview do lab (`bun run dash:basf:serve` → http://localhost:4173) nas mesmas seleções — por exemplo BASF 2024 área 111.587.
4. "Sales (novo)" abre com as 3 abas; Vendas 2024 = R$ 62.619.923,49.
5. Trocar direto de "BI Mercado (novo)" para "Sales (novo)" remonta o painel (título muda para "Vendas").
6. A URL fica `/dashboard/shift/18` ou `/26`, sem `#` — e mexer em filtros não altera a URL.
7. Ícones Material da sidebar continuam aparecendo como ícone (não como texto).
8. No DevTools, aba Network: `ibge` chega com `content-encoding: gzip` ou `br`.
9. No console do DevTools, logado: `fetch("/api/dashboard/shift/26/ibge", {headers: {Authorization: "Bearer " + JSON.parse(localStorage.getItem("access_token") ?? "null")}}).then(r => r.json()).then(console.log)` → `status: 1`, erro "Recurso 'ibge' não existe neste dashboard." (se o token não estiver nesse formato no localStorage, pule e anote).
10. Um usuário sem a permissão 58 não vê "BI Mercado (novo)" no menu.

- [ ] **Step 5: Reportar**

Liste para o usuário o que passou e o que não passou, com print/erro. Não feche a branch. Ajustes de layout no portal (largura, sidenav, fundo) voltam como tasks novas.

---

### Task 8: Produção (só com ordem explícita do usuário)

Cada passo aqui é de mão única (deploy automático, banco da Azure). Peça confirmação antes de **cada** um.

- [ ] **Step 1: Deploy do código** — merge de `feat/shift-bi-dashboards` na `master` do Basf e push (dispara `master_portalbasf.yml`). Sem as linhas de menu, ninguém vê a rota nova; seguro ir antes do SQL.
- [ ] **Step 2: SQL na Azure** — rodar `001_shift_bi_dashboards.sql` no banco do portal na Azure. Os `THROW` do começo param o script se os ids 89/94/18/26 forem diferentes lá; nesse caso, pare e reporte.
- [ ] **Step 3: Carga na Azure** — `PORTAL_DB=<banco da Azure> bun --env-file=<env com credenciais da Azure> run web/basf/snapshot/banco.ts`. Sem `DB_TRUST_CERT` (ver `## Banco` no `CLAUDE.md`).
- [ ] **Step 4: Avisar os usuários** para deslogar e logar de novo.

## Fora deste plano

- Importação pelo portal (`etl_mapping`) das fontes do Mercado — quando a BASF precisar atualizar sozinha.
- `vendas` ao vivo a partir de `basf_vendas` — hoje é snapshot (decisão 2).
- Budget/forecast 2025-26 e IBGE municipal 2024 — pendências de dado, não de código (ver `meta_anual.json`).
- Desligar os PBI publish-to-web — só depois que a BASF aprovar os novos.
