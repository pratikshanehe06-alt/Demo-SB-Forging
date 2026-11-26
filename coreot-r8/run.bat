@echo off
rem Start CoreOT R8 on this computer, then open http://localhost:8000
cd /d "%~dp0"
if not exist .venv (
  echo First run: setting up Python packages ^(needs internet once^)...
  py -3 -m venv .venv || python -m venv .venv
  .venv\Scripts\python -m pip install -q --upgrade pip
  .venv\Scripts\pip install -q -r backend\requirements.txt
)
cd backend
if "%PORT%"=="" set PORT=8000
..\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port %PORT%
