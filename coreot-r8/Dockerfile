FROM python:3.13-slim
WORKDIR /srv/coreot
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 COREOT_DATA_DIR=/data
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY frontend frontend
RUN useradd -r -u 10001 coreot && mkdir -p /data && chown coreot /data
USER coreot
WORKDIR /srv/coreot/backend
EXPOSE 8000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/api/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
