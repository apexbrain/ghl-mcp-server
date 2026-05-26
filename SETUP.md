# Setup paso a paso

## 1. Generar el Private Integration Token en GHL

> **Importante**: el token se crea **a nivel sub-cuenta** (location), no a nivel agencia. Cada location tiene su propio token y solo puede operar sobre su propia data.

1. En GHL, asegúrate de estar dentro de la sub-cuenta correcta. Para `The Comp Firm` la URL típica es: `https://app.gohighlevel.com/v2/location/dwxSwOQEoRll35Hpp8sh/dashboard`.
2. Menú lateral → **Settings** (⚙️ abajo a la izquierda).
3. Dentro de Settings, busca en el menú izquierdo **Private Integrations**.
   - Si no lo ves, es porque el feature está deshabilitado para la sub-cuenta. Pide al admin de la agencia que active *Private Integrations* en **Agency Settings → Company → Feature Toggles → Allow Private Integrations**.
4. Click **Create new integration** (botón arriba a la derecha).
5. Completa:
   - **Integration name**: `claude-mcp` (o el nombre que prefieras — solo para tu referencia).
   - **Scopes**: marca **todos** los scopes disponibles para obtener cobertura completa (los puedes recortar después). Como mínimo activa:
     - `View / Edit Contacts`
     - `View / Edit Conversations` (+ messages)
     - `View / Edit Opportunities`
     - `View / Edit Calendars` (+ events + groups)
     - `View / Edit Custom Fields`
     - `View / Edit Locations`
     - `View / Edit Forms` (+ submissions)
     - `View / Edit Workflows`
     - `View / Edit Products`
     - `View / Edit Invoices` (+ payments)
     - `View / Edit Surveys`
     - `View / Edit Blogs`
     - `View / Edit Social Planner`
     - `View / Edit Medias`
     - `View / Edit Users`
6. Click **Create**.
7. **COPIA EL TOKEN INMEDIATAMENTE** — GHL solo te lo muestra una vez. Empieza con `pit-`.
   Pégalo en un sitio seguro (1Password, .env local, etc.). Si lo pierdes, tienes que crear uno nuevo.

## 2. Build local (una sola vez)

```bash
cd "/Users/andreslombana/Documents/Claude/Projects/GHL + Claude/ghl-mcp-server"
npm install
npm run build
```

## 3. Registrar el MCP en Claude Code

### Opción A — comando CLI (recomendado)

```bash
claude mcp add gohighlevel \
  -s user \
  -e GHL_PRIVATE_INTEGRATION_TOKEN=pit-TU-TOKEN-AQUI \
  -e GHL_DEFAULT_LOCATION_ID=dwxSwOQEoRll35Hpp8sh \
  -- node "/Users/andreslombana/Documents/Claude/Projects/GHL + Claude/ghl-mcp-server/dist/server.js"
```

`-s user` lo agrega a tu config personal (`~/.claude.json`) — así está disponible en todos tus proyectos. Para limitarlo a este proyecto, usa `-s project` (crea `.mcp.json` en el cwd).

### Opción B — editar `~/.claude.json` a mano

Bajo la clave `mcpServers`, agrega:

```json
"gohighlevel": {
  "command": "node",
  "args": [
    "/Users/andreslombana/Documents/Claude/Projects/GHL + Claude/ghl-mcp-server/dist/server.js"
  ],
  "env": {
    "GHL_PRIVATE_INTEGRATION_TOKEN": "pit-TU-TOKEN-AQUI",
    "GHL_DEFAULT_LOCATION_ID": "dwxSwOQEoRll35Hpp8sh"
  }
}
```

## 4. Reiniciar Claude Code

Sal de la sesión actual y abre una nueva. En la nueva sesión deberías ver las 369 tools bajo el prefijo `mcp__gohighlevel__` en el listado de tools deferred (cargables vía ToolSearch).

## 5. Verificar

En la nueva sesión, pídele a Claude:

> "Con el MCP gohighlevel (el nuevo, no el oficial), dame el detalle de mi location"

Y luego, para probar la creación de un custom field:

> "Crea un custom field tipo TEXT llamado 'Test Field MCP' en el objeto contact"

Si algo falla, revisa los logs:

```bash
tail -f ~/Library/Logs/Claude/mcp*.log
```
