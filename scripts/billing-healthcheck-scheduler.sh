#!/bin/sh
# Healthcheck: processo vivo + tick recente (scheduler loop ~600s).
set -eu

HEALTH_FILE="/tmp/billing-scheduler.health"
MAX_AGE_SEC="${BILLING_SCHEDULER_HEALTH_MAX_AGE_SEC:-900}"

if [ ! -f "$HEALTH_FILE" ]; then
  exit 1
fi

now=$(date +%s)
last=$(cat "$HEALTH_FILE")
age=$((now - last))
[ "$age" -le "$MAX_AGE_SEC" ] || exit 1
exit 0
