#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="claude-manager"
PORT=3001

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'; RESET='\033[0m'
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'

log()  { echo -e "${BLUE}▸${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
die()  { echo -e "${RED}✗${RESET} $*"; exit 1; }

echo -e "\n${BOLD}◈ Claude Manager — Deploy${RESET}\n"

# ── Parse args ────────────────────────────────────────────────────────────────
CMD="${1:-deploy}"   # deploy | stop | restart | status | logs

case "$CMD" in

# ── DEPLOY ───────────────────────────────────────────────────────────────────
deploy)
  # 1. Server deps
  log "Installing server dependencies…"
  (cd "$DIR" && npm install --omit=dev --silent)
  ok "Server deps ready"

  # 2. Client deps + build
  log "Installing client dependencies…"
  (cd "$DIR/client" && npm install --silent)
  ok "Client deps ready"

  log "Building client…"
  (cd "$DIR/client" && npm run build -- --silent 2>&1 | grep -E 'built|error|warn' || true)
  ok "Client built → client/dist/"

  # 3. Start/reload via pm2
  if pm2 describe "$APP" &>/dev/null; then
    log "Reloading existing pm2 process…"
    pm2 reload "$DIR/ecosystem.config.cjs" --update-env
  else
    log "Starting with pm2…"
    pm2 start "$DIR/ecosystem.config.cjs"
  fi

  # 4. Save pm2 list so it survives reboots
  pm2 save --force &>/dev/null

  echo ""
  ok "Deployed! Running at ${BOLD}http://localhost:${PORT}${RESET}"

  # 5. Open browser (macOS)
  if command -v open &>/dev/null; then
    sleep 1 && open "http://localhost:${PORT}"
  fi
  ;;

# ── STOP ─────────────────────────────────────────────────────────────────────
stop)
  if pm2 describe "$APP" &>/dev/null; then
    pm2 stop "$APP"
    ok "Stopped $APP"
  else
    warn "$APP is not running"
  fi
  ;;

# ── RESTART ──────────────────────────────────────────────────────────────────
restart)
  log "Rebuilding and restarting…"
  "$0" deploy
  ;;

# ── STATUS ───────────────────────────────────────────────────────────────────
status)
  if pm2 describe "$APP" &>/dev/null; then
    pm2 show "$APP"
  else
    warn "$APP is not registered with pm2"
  fi
  ;;

# ── LOGS ─────────────────────────────────────────────────────────────────────
logs)
  pm2 logs "$APP" --lines "${2:-50}"
  ;;

# ── DELETE (full remove) ─────────────────────────────────────────────────────
delete)
  pm2 delete "$APP" 2>/dev/null || true
  pm2 save --force &>/dev/null
  ok "Removed $APP from pm2"
  ;;

*)
  echo "Usage: $0 [deploy|stop|restart|status|logs|delete]"
  echo ""
  echo "  deploy   Build client + start/reload server (default)"
  echo "  stop     Stop the server"
  echo "  restart  Rebuild + reload (alias for deploy)"
  echo "  status   Show pm2 process info"
  echo "  logs     Tail logs (optional: number of lines)"
  echo "  delete   Remove from pm2 entirely"
  exit 1
  ;;
esac
