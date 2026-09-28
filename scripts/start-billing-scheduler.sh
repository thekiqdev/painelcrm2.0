#!/bin/sh
# Loop operacional do billing scheduler (one-shot Node + sleep). Docker / EasyPanel.
set -eu

LOG_PREFIX="[BILLING_SCHEDULER]"
RUN=1
INTERVAL_SEC="${BILLING_SCHEDULER_LOOP_SECONDS:-600}"
HEALTH_FILE="/tmp/billing-scheduler.health"
WORKDIR="${BILLING_APP_DIR:-/app}"

log() {
  printf '%s %s %s\n' "$LOG_PREFIX" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

on_term() {
  RUN=0
  log "shutdown signal received, finishing current tick..."
}

trap on_term TERM INT

touch_health() {
  date +%s >"$HEALTH_FILE"
}

cd "$WORKDIR"

log "startup pid=$$ workdir=$WORKDIR loop_interval=${INTERVAL_SEC}s node=dist/scripts/runRecurringScheduler.js"
touch_health

while [ "$RUN" -eq 1 ]; do
  touch_health
  log "loop tick: starting run"
  if node dist/scripts/runRecurringScheduler.js; then
    log "loop tick: run finished ok"
  else
    rc=$?
    log "loop tick: run finished exit=${rc}"
  fi

  if [ "$RUN" -eq 0 ]; then
    break
  fi

  log "loop tick: sleeping ${INTERVAL_SEC}s"
  elapsed=0
  while [ "$RUN" -eq 1 ] && [ "$elapsed" -lt "$INTERVAL_SEC" ]; do
    sleep 1
    elapsed=$((elapsed + 1))
  done
done

log "shutdown complete"
exit 0
