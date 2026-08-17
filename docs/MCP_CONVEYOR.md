# MCP + Conveyor setup (TravelHub senior stack)

Global config: `C:\Users\Ильяс\.cursor\mcp.json`  
Secrets / wrappers: `C:\cursor-mcp\`

## Installed servers

| Server | Role | Auth |
|--------|------|------|
| **github** | PRs, issues, Actions | PAT → `C:\cursor-mcp\secrets\github_pat.txt` |
| **sentry** | Production errors | OAuth |
| **linear** | Tasks / PM | OAuth |
| **notion** | Specs / wiki / handoff docs | OAuth |
| **figma** | Design → code | OAuth |
| **context7** | Fresh library docs | usually none |
| **chrome-devtools** | Perf, console, network (web) | none (Chrome) |
| **playwright** | Web E2E / screenshots | none |
| **postgres** | DB query + tuning | URL → `postgres_url.txt` |
| **brave-search** | Live web search | key → `brave_api_key.txt` |
| **firecrawl** | Scrape docs/competitors to markdown | key → `firecrawl_api_key.txt` |
| **semgrep** | Security SAST | none (uvx); Docker optional |
| **shadcn** | Web UI components (site/admin) | none |
| **ui-ux-pro** | Design patterns | none |
| **react-native-dev** | Metro / RN runtime | none |
| **mobile-mcp** | Mobile tooling | none |
| **exposnap** | Expo screenshots | none |
| **filesystem** | Both repos | none |
| **memory** | Durable decisions | none |
| **sequential-thinking** | Hard planning | none |

Removed: **puppeteer** (дубль Playwright).

Not added (не твой стек / риск шума): Stripe (у тебя Т‑Банк), Cloudflare (SpaceWeb), remote GitHub Copilot OAuth.

## Enable keys (optional but powerful)

1. `C:\cursor-mcp\secrets\postgres_url.txt` — `postgresql://...`
2. `C:\cursor-mcp\secrets\brave_api_key.txt` — [Brave Search API](https://brave.com/search/api/)
3. `C:\cursor-mcp\secrets\firecrawl_api_key.txt` — [Firecrawl](https://www.firecrawl.dev/)

## OAuth (Cursor → Settings → Tools & MCP)

Connect: **Sentry, Linear, Notion, Figma**. Then Reload.

## Tool budget

Cursor ~лимит инструментов. Если агент «тупит» или MCP красные пачками — выключи то, чем не пользуешься на этой неделе (часто: firecrawl, brave, shadcn, exposnap).

## Conveyor

PM (Linear/Notion) → Design (Figma/концепт) → Backend → App → Semgrep/Sentry → Playwright/Chrome → Preview OTA / TestFlight.
