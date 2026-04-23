# Monitoring stack (free-tier friendly)

This directory provides a local/self-hosted observability stack:

- Uptime Kuma (uptime + alerts)
- Loki (log storage)
- Promtail (log shipping)
- Grafana (dashboards + log exploration)

## 1) Configure env

```bash
cp monitoring/.env.example monitoring/.env
```

Update credentials/ports in `monitoring/.env` as needed.

## 2) Start stack

```bash
docker compose --env-file monitoring/.env -f monitoring/docker-compose.yml up -d
```

## 3) Access

- Uptime Kuma: `http://localhost:3001`
- Grafana: `http://localhost:3002`
- Loki API: `http://localhost:3100`

Default Grafana credentials are in `monitoring/.env`.

## Suggested first monitors in Uptime Kuma

- `GET /health` on API
- `GET /openapi.json` on API
- `GET /docs` on API
- `GET /nl/login` on web

## Notes

- Promtail is configured to scrape host `/var/log/*.log` and Docker container logs.
- For production, run these components in managed Azure services where possible, or in dedicated Container Apps/VMs.
- For app-level error tracking, keep Sentry enabled alongside this stack.
