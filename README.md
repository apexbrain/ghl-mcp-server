# ghl-mcp-server

Unofficial **MCP server** that exposes the full surface of the official
[`@gohighlevel/api-client`](https://github.com/GoHighLevel/highlevel-api-sdk) SDK as Model Context Protocol tools.

- **369 tools** across **31 modules** (contacts, calendars, conversations,
  opportunities, custom fields, products, invoices, payments, workflows,
  social-media-posting, surveys, blogs, forms, locations, and more).
- Auto-generated from the SDK source — re-run `npm run generate` after
  upgrading `@gohighlevel/api-client` and you get every new endpoint for free.
- Works with any MCP-compatible client (Claude Code, Claude Desktop, etc.).

## What this is (and isn't)

This MCP wraps every method the official GHL SDK exposes — which is the same
surface as the [GHL Public API](https://highlevel.stoplight.io/). So:

- ✅ **CRUD** on contacts, opportunities, custom fields, products, invoices,
  calendars, blog posts, social posts, calendar events, etc.
- ✅ **Read** form submissions, conversations, transactions, workflows.
- ✅ **Send** messages, create appointments, manage tags, trigger workflows.
- ❌ **Form / Funnel / Website builder** — the public API does not expose
  endpoints to create or edit forms, funnels, or websites. Those are UI-only.

## Setup

### 1. Install

```bash
git clone https://github.com/<you>/ghl-mcp-server.git
cd ghl-mcp-server
npm install
npm run build
```

### 2. Generate a Private Integration Token

In GoHighLevel:

1. Go to **Settings → Private Integrations** (sub-account level, *not* agency).
2. Click **Create new integration**.
3. Give it a name (e.g. `claude-mcp`) and select the scopes you want exposed.
   For full coverage, enable every scope (you can revoke later).
4. Copy the generated token — you only see it once.

### 3. Register with Claude Code

Add to your `~/.claude.json` (or the project's `.mcp.json`):

```json
{
  "mcpServers": {
    "gohighlevel": {
      "command": "node",
      "args": ["/absolute/path/to/ghl-mcp-server/dist/server.js"],
      "env": {
        "GHL_PRIVATE_INTEGRATION_TOKEN": "pit-...",
        "GHL_DEFAULT_LOCATION_ID": "your-location-id"
      }
    }
  }
}
```

Or via CLI:

```bash
claude mcp add gohighlevel \
  -e GHL_PRIVATE_INTEGRATION_TOKEN=pit-... \
  -e GHL_DEFAULT_LOCATION_ID=your-location-id \
  -- node /absolute/path/to/ghl-mcp-server/dist/server.js
```

Restart Claude Code. The 369 tools appear under the `gohighlevel` namespace.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GHL_PRIVATE_INTEGRATION_TOKEN` | yes | Token from GHL Settings → Private Integrations |
| `GHL_DEFAULT_LOCATION_ID` | no | Used as fallback when a tool needs `locationId` and the caller did not provide one |

## Tool naming

Tools are named `<service>_<method>`, taken directly from the SDK:

| Tool | Calls |
|---|---|
| `contacts_createContact` | `ghl.contacts.createContact(params, body)` |
| `customFields_createCustomField` | `ghl.customFields.createCustomField(params, body)` |
| `forms_getFormsSubmissions` | `ghl.forms.getFormsSubmissions(params)` |
| `opportunities_searchOpportunity` | `ghl.opportunities.searchOpportunity(params)` |

Every tool accepts a single arg object: `{ params?, requestBody? }`. The JSON
Schema in `inputSchema` describes exactly what each field expects.

## Re-generating after SDK upgrades

```bash
npm install @gohighlevel/api-client@latest
npm run build
```

`src/tools.generated.ts` is rebuilt from scratch — new endpoints appear
automatically as new tools.

## Development

```bash
npm run generate   # parse SDK -> src/tools.generated.ts
npm run build      # generate + tsc
npm run dev        # run server directly via tsx (no build needed)
npm start          # run built dist/server.js
```

## License

MIT
