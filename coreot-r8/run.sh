#!/usr/bin/env bash
# Start CoreOT R8 on this computer: ./run.sh   then open http://localhost:8000
set -e
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
if [ ! -d .venv ]; then
  echo "First run: setting up Python packages (needs internet once)..."
  $PY -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r backend/requirements.txt
fi
cd backend
exec ../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
