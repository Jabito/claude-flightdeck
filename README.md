# Claude Flightdeck

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

A visual control panel for [Claude Code](https://claude.ai/code) — manage your agent files, run commands, automate workflows via webhooks, JIRA polls, and schedules, and watch everything happen in real time.

**Project Owner:** Jose Paolo "Javi" Javier

> **Note:** Claude Flightdeck is a companion tool — it requires a working [Claude Code CLI](https://claude.ai/code) installation. It does not bundle or replace Claude Code itself.

---

## Features

### File Workspace
- Browse, edit, and save files under `~/.claude/` — agents, commands, skills, settings, and more
- Relationship graph showing connections between agents, commands, and skills
- Monaco-based editor with syntax highlighting
- Move and reorganize files within the workspace

### Run Tab
- Select any Claude Code slash command (e.g. `/dev:plan`, `/doc:knowledge`) from a dropdown
- Add arguments, context, and attach files
- Choose any local or Bitbucket project as the working directory
- Live streaming output with per-line elapsed timestamps
- Toggle `--dangerously-skip-permissions` per run

### Runs List
- Full history of all command runs with start datetime and elapsed duration
- Re-run any previous run — pre-populates the Run form with original parameters
- Interactive reply input: send `y`, `n`, or custom messages to Claude mid-run (for runs without skip-permissions)
- Visual "⏸ needs input" indicator when Claude is waiting for a response
- Kill running processes; clear history

### Webhooks
- Register HTTP webhook endpoints (e.g. `POST /webhooks/create-plan`)
- Map payload fields to command arguments via `{{template}}` tokens
- Optional secret key validation
- View per-webhook run history with full output

### JIRA Polls
- Periodically query Jira with any JQL filter
- Trigger a Claude command for each newly matched issue
- Token templates: `{{key}}`, `{{summary}}`, `{{status}}`, `{{assignee}}`, `{{type}}`
- Configurable interval (5m – 2h+), max issues per cycle, enable/disable per poll
- Supports Jira Server/DC (PAT/Bearer) and Jira Cloud (email + API token)

### Schedules
- Cron-based scheduled Claude command runs
- Per-schedule command, arguments, project path, and permissions
- Run immediately via "Run Now" for testing

### Auto Runs Panel
- Unified view of all webhook, poll, and schedule run history
- Filter by source type
- Live output streaming, kill controls, and interactive reply input for automation runs

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Frontend | React 18 + Vite |
| Editor | Monaco Editor |
| Graph | React Flow |
| Process manager | pm2 |

---

## Expected Claude File Locations

Claude Flightdeck reads from and manages the standard Claude Code directory at `~/.claude/`:

```
~/.claude/
├── CLAUDE.md                    # Global instructions loaded in every session
├── settings.json                # Permissions, env vars, hooks, MCP servers
├── plugins.local.md             # Local credentials (Jira/Confluence PATs) — not synced
├── agents/                      # Agent definitions (orchestrators + workers)
│   ├── task-director.md
│   ├── backend-engineer.md
│   └── ...
├── commands/                    # Slash command entry points
│   ├── dev/
│   │   ├── plan.md              # /dev:plan
│   │   ├── implement.md         # /dev:implement
│   │   └── ...
│   └── doc/
│       └── ...
├── skills/                      # Domain reference knowledge injected into agents
│   ├── dev/
│   ├── docs/
│   └── ...
└── instincts/                   # Auto-generated pattern memory (self-evolution)
```

### `plugins.local.md` — Credential Format

Required for JIRA polls and Confluence integrations:

```markdown
confluence_url: https://your-confluence.example.com/confluence
confluence_pat: YOUR_CONFLUENCE_PAT
jira_url: https://your-jira.example.com/jira
jira_pat: YOUR_JIRA_PAT
```

For Jira Cloud (email + API token), configure instead in `~/.claude/settings.json`:

```json
{
  "env": {
    "ATLASSIAN_BASE_URL": "https://yourorg.atlassian.net",
    "ATLASSIAN_EMAIL": "you@example.com",
    "ATLASSIAN_API_TOKEN": "your-api-token"
  }
}
```

---

## Setup

### Prerequisites

- Node.js 18+
- npm
- [Claude Code CLI](https://claude.ai/code) installed and accessible as `claude`
- pm2 (`npm install -g pm2`)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/Jabito/claude-flightdeck.git
cd claude-flightdeck
# Deploy (installs deps, builds client, starts via pm2)
bash deploy.sh

# Open in browser
open http://localhost:3001
```

### Other deploy commands

```bash
bash deploy.sh             # Build + start/restart (default)
bash deploy.sh restart     # Rebuild and restart
bash deploy.sh stop        # Stop the server
bash deploy.sh status      # Show pm2 process info
bash deploy.sh logs        # Tail logs (add number for line count: logs 100)
bash deploy.sh delete      # Remove from pm2 entirely
```

### Development Mode

```bash
npm install
cd client && npm install && cd ..
npm run dev    # Starts backend with nodemon + Vite dev server concurrently
```

---

## Configuration

### Per-user files (gitignored — each user maintains their own)

| File | Purpose |
|---|---|
| `polls.json` | Your JIRA poll configurations |
| `webhooks.json` | Your webhook configurations |
| `schedules.json` | Your schedule configurations |
| `command-runs.json` | Local run history |
| `poll-runs.json` | Local poll run history |
| `schedule-runs.json` | Local schedule run history |
| `webhook-runs.json` | Local webhook run history |

Copy the provided `.example.json` files as starting points:

```bash
cp polls.example.json polls.json
cp webhooks.example.json webhooks.json
cp schedules.example.json schedules.json
```

### Port

Default port is `3001`. Override via environment variable:

```bash
PORT=4000 bash deploy.sh
```

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a PR.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). Please do not open public issues for security concerns.

## License

[MIT](LICENSE)
