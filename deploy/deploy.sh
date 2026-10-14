#!/usr/bin/env bash
# Run on the server from the repo root: ./deploy/deploy.sh
# Pulls the latest main, rebuilds the frontend, applies DB migrations
# (data is kept; only schema changes are applied) and restarts the app.
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch origin main
git reset --hard origin/main

npm --prefix frontend ci
npm --prefix frontend run build

source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/manage.py migrate --noinput
python backend/manage.py collectstatic --noinput

sudo systemctl restart cinetrack
echo "Deployed $(git rev-parse --short HEAD)"
