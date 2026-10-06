FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    P5_CONFIG_DIR=/config P5_ASSETS_DIR=/assets \
    PUID=99 PGID=100 UMASK=002
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Build-Infos für die Fußzeile (vom GitHub-Workflow übergeben)
ARG P5_BRANCH=""
ARG P5_COMMIT=""
ARG P5_TAG=""
ARG P5_REPO="https://github.com/p5lukas/p5assets"
ENV P5_BRANCH=$P5_BRANCH P5_COMMIT=$P5_COMMIT P5_TAG=$P5_TAG P5_REPO=$P5_REPO
COPY app ./app
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
VOLUME ["/config", "/assets"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8080/api/status')" || exit 1
ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
