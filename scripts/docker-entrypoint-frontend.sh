#!/bin/sh
# Substitui __BACKEND_UPSTREAM__ pelo host do backend (BACKEND_HOST:3001)
# No Easypanel: defina a variável BACKEND_HOST com o nome do serviço do backend
BACKEND_HOST="${BACKEND_HOST:-painelcrm-backend}"
BACKEND_UPSTREAM="${BACKEND_HOST}:3001"
sed "s|__BACKEND_UPSTREAM__|${BACKEND_UPSTREAM}|g" /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
