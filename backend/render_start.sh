#!/usr/bin/env bash
set -o errexit

python manage.py migrate --noinput
python manage.py ensure_superuser --noinput
gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --timeout "${GUNICORN_TIMEOUT:-90}"
