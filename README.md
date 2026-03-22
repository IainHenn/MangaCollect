# MangaCollect
Hub of American Physical Releases + Ability to Track Physical Collection and Wishlist

## **Setup**

- **Prerequisites**: Install Docker and Docker Compose (or Docker Desktop).
- **Environment**: Create a `.env` file in the repository root with the required variables used by services, for example:

	- `DATABASE`, `HOST`, `PORT`, `USER`, `PASSWORD`, `SECRET_KEY`
	- `EMAIL`, `EMAIL_PASSWORD`, `SMTP`, `SMTP_PORT`, `USE_TLS`, `APP_PASSWORD`, `FRONTEND_URL`
	- `AWS_REGION`, `AWS_BUCKET_NAME`

- **Production (build + detach)**: run from repository root

```bash
docker compose up -d --build
```

- **Development (hot reload)**: uses `docker-compose.dev.yml` which mounts source and runs watchers inside Go containers. Run from repository root:

```bash
docker compose -f docker-compose.dev.yml up --build
```

- **Dev ports (host -> container)**: auth 8081 -> 8080, user 8082 -> 8080, submission 8083 -> 8080, manga-data 8084 -> 8080.
- **Gateway (production)**: nginx listens on host port 8080 and proxies to services.

- **Notes**: Add an `.air.toml` or adjust the `command` in `docker-compose.dev.yml` if you prefer a different Go file-watcher (e.g., CompileDaemon, reflex). Ensure env vars are set before starting compose.

