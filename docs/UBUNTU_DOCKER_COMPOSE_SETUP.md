# Ubuntu: Docker, first-time DB, and Compose

Run a **pre-built Fabriq image** on any Ubuntu host (e.g. AWS EC2): install Docker only if needed, seed the database once, then run the stack as a daemon with log rotation and optional host log directories.

For **building** the image and CI, see [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md).

---

## 1. Prerequisites

- Ubuntu with SSH access.
- **Security group / firewall**: allow **8080** (or **80/443** if you terminate TLS in front). If you use **embedded Postgres** and publish **5432**, restrict it to your IP or VPC only—never the open internet.
- A **PostgreSQL** database reachable from the host (e.g. RDS), **or** use **embedded** Postgres inside the image (see §6).

---

## 2. Docker Engine and Compose

**If Docker is already installed**, skip to §3. Check with:

```bash
docker version && docker compose version
```

**Install** (official Docker packages on Ubuntu):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker "$USER"
```

Log out and back in so `docker` works without `sudo`. Enable Docker on boot:

```bash
sudo systemctl enable --now docker
```

---

## 3. Install directory and logs

```bash
sudo mkdir -p /opt/fabriq/{logs/nginx,logs/backend,postgres-data}
sudo chown -R "$USER:$USER" /opt/fabriq
cd /opt/fabriq
```

---

## 4. Image and `.env`

Log in to your registry if the image is private, then pull:

```bash
docker login <your-registry>
docker pull <your-registry>/fabriq:<tag>
```

Create **`/opt/fabriq/.env`** in the **same folder** as `compose.yaml`. Compose loads it for variable substitution and (via `env_file`) into the container. Minimum:

| Variable        | Required | Notes                                      |
|-----------------|----------|--------------------------------------------|
| `DATABASE_URL`  | Yes*     | External Postgres connection string        |
| `JWT_SECRET`    | Yes      | Long random secret                         |
| `NODE_ENV`      | Recommended | e.g. `production`                      |
| `PORT`          | Optional | Default **8080** (nginx listens here)      |

\* With **embedded** Postgres (`USE_EMBEDDED_PG=true`), the image defaults `DATABASE_URL` for the in-container database; you may still set overrides—see [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md).

Example:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
JWT_SECRET=your-long-random-secret
NODE_ENV=production
PORT=8080
```

---

## 5. First-time database setup (external Postgres only)

For an **empty** external database, run **once** before `docker compose up`. This resets schema and loads metadata, workflows, and **Indian demo** data (same as `node setup-db.js --demo-data=indian-demo --skip-tests` in development).

```bash
cd /opt/fabriq

docker run --rm \
  --env-file .env \
  --entrypoint "" \
  <your-registry>/fabriq:<tag> \
  sh -c 'cd /app/backend && node setup-db.js --demo-data=indian-demo --skip-tests'
```

**Warning:** `setup-db.js` runs `prisma db push --force-reset`—all existing data in that database is dropped.

**Embedded Postgres:** On **first** start with an **empty** data volume, `start-with-pg.sh` already runs schema push and Indian demo setup. You normally **do not** run the command above unless you use external Postgres or are recovering manually.

---

## 6. `compose.yaml`

Place **`compose.yaml`** next to **`.env`** in `/opt/fabriq`. Replace the image line with your real reference.

### External Postgres (typical for RDS / managed DB)

```yaml
services:
  app:
    image: <your-registry>/fabriq:<tag>
    container_name: fabriq
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "8080:8080"
    environment:
      PORT: "8080"
      NODE_ENV: production
    volumes:
      - ./logs/nginx:/var/log/nginx
      - ./logs/backend:/app/backend/logs
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"
        labels: "fabriq"
```

### Embedded Postgres (single container)

```yaml
services:
  app:
    image: <your-registry>/fabriq:<tag>
    container_name: fabriq
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "8080:8080"
    environment:
      PORT: "8080"
      NODE_ENV: production
      USE_EMBEDDED_PG: "true"
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
      - ./logs/nginx:/var/log/nginx
      - ./logs/backend:/app/backend/logs
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "10"
        labels: "fabriq"
```

Add `"5432:5432"` under `ports` only if you need Postgres from outside the host.

### Human-readable `image:` tag

Set **`image:`** to a **named tag** (e.g. `ghcr.io/your-org/fabriq:knack-dev`) rather than only `image: ghcr.io/.../fabriq@sha256:…`, so Compose files stay readable. CI still pushes digest-based tags for traceability; you can pin by digest in production if required.

### Inspect embedded build metadata

Official images include **`/app/build-info.json`** (backend/frontend git branch, commit, message, commit timestamp, Docker build time, image tag). From the host:

```bash
docker compose exec app cat /app/build-info.json
```

Details: [BUILD_AND_DEPLOY.md — Image build metadata](./BUILD_AND_DEPLOY.md#image-build-metadata-debugging).

---

## 7. Run as a daemon

```bash
cd /opt/fabriq
docker compose up -d
```

Check health:

```bash
curl -sS http://127.0.0.1:8080/health
```

Default login (demo seed): `admin@example.com` / `admin123` (see root [CLAUDE.md](../CLAUDE.md)).

---

## 8. Logs

| Goal | Command / location |
|------|-------------------|
| Follow container stdout/stderr | `docker compose logs -f --tail=200 app` |
| Rotated Docker JSON logs | Under `/var/lib/docker/containers/` (managed by Docker; rotation via `logging` options above) |
| Host paths | `./logs/nginx` and `./logs/backend` on the host (nginx file logs and any app file logs under `/app/backend/logs`) |

Backend output that goes only to **stdout** appears in `docker compose logs`, not necessarily in `./logs/backend` unless the app writes files there.

---

## 9. Day-to-day commands

```bash
docker compose ps
docker compose logs -f app
docker compose restart app
docker compose pull && docker compose up -d
```

One-off shell inside the same image/env (e.g. maintenance):

```bash
docker compose run --rm --entrypoint sh app -c 'cd /app/backend && node setup-db.js --help'
```

---

## 10. `.env` and Compose

- **Interpolation** in `compose.yaml` (e.g. `${SOME_VAR}`) uses `.env` in the project directory automatically.
- **Container environment** is applied via `env_file: - .env` on the service (as in the examples above).

Keep `.env` next to `compose.yaml` and **do not commit** secrets.
