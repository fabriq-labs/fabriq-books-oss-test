# Fabriq dev VM – Singapore (Cursor Remote SSH + Docker)

VM for building and testing the Docker image before deploying to Cloud Run.

**Full build and deploy strategy:** see **[BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md)** (root-repo-only workflow, Docker Compose, Cloud Build).

## VM details

| Item | Value |
|------|--------|
| **Name** | `fabriq-dev-vm` |
| **Zone** | `asia-southeast1-b` (Singapore) |
| **External IP** | `34.87.77.156` |
| **Project** | `kickoff19-237210` |
| **Machine type** | `e2-standard-8` (8 vCPU, 32 GB RAM) – sized for fast Docker builds |
| **Disk** | 30 GB boot |

Software (installed by startup script): **Docker**, **Docker Compose** (plugin), **git**.

If the VM is stopped (e.g. after resize), start it:  
`gcloud compute instances start fabriq-dev-vm --zone=asia-southeast1-b`

If `docker` commands fail with "permission denied", run once: `sudo usermod -aG docker $USER` then log out and back in (or reconnect with Cursor).

---

## 1. Cursor Remote SSH to this VM

### Step 1: Get your SSH username (from your Mac)

```bash
gcloud compute ssh fabriq-dev-vm --zone=asia-southeast1-b --command="whoami"
```

Note the output (e.g. `prasannaj` or `pj`). That is **USER** below.

### Step 2: Put your key on the VM (one-time)

So Cursor can connect without gcloud in the middle, connect once with gcloud so the VM gets your key:

```bash
gcloud compute ssh fabriq-dev-vm --zone=asia-southeast1-b
# At the prompt, type: exit
```

Your `~/.ssh/google_compute_engine` (or project default) key is now authorized on the VM.

### Step 3: Add host to `~/.ssh/config` (on your Mac)

Open or create `~/.ssh/config` and append (replace **USER** with the username from Step 1):

```
Host fabriq-dev-vm
  HostName 34.87.77.156
  User USER
  IdentityFile ~/.ssh/google_compute_engine
```

If your key is elsewhere (e.g. `~/.ssh/id_ed25519`), use that path instead of `~/.ssh/google_compute_engine`.

### Step 4: Connect in Cursor

1. **Cmd+Shift+P** (or Ctrl+Shift+P) → **Remote-SSH: Connect to Host**.
2. Choose **fabriq-dev-vm** from the list (or type `fabriq-dev-vm`).
3. New window opens; when asked, pick **Linux** for the remote platform.
4. After connection, **File → Open Folder** and open **~/repos/fabriq** (e.g. `/home/USER/repos/fabriq`).

You’re now editing and running on the VM. To disconnect: close the remote window or run **Remote-SSH: Close Remote Connection**.

---

## 2. Get the root repo on the VM

You only check in/out the **root repo** on the VM. Either:

- **From your Mac:** clone the root repo to the VM and copy deployment files:
  ```bash
  gcloud compute scp Dockerfile docker-compose.yml docker-compose.external-pg.yml nginx.conf start.sh start-with-pg.sh start-external.sh .dockerignore cloudbuild.yaml cloudbuild-dev.yaml fabriq-dev-vm:~/ --zone=asia-southeast1-b
  gcloud compute ssh fabriq-dev-vm --zone=asia-southeast1-b --command="mkdir -p ~/repos/fabriq && mv ~/Dockerfile ~/docker-compose.yml ~/docker-compose.external-pg.yml ~/nginx.conf ~/start.sh ~/start-with-pg.sh ~/start-external.sh ~/.dockerignore ~/cloudbuild.yaml ~/cloudbuild-dev.yaml ~/repos/fabriq/ 2>/dev/null; ls ~/repos/fabriq"
  ```
- **Or on the VM:** clone only the **root repo** into `~/repos/fabriq` (e.g. `mkdir -p ~/repos && git clone <root-repo-url> ~/repos/fabriq`). The agent will clone backend and frontend (demo) when you build.

## 3. On the VM: run with Docker Compose (agent clones backend + frontend if missing)

See **[BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md)** and **[AGENT_PROMPT_CLOUD_VM.md](./AGENT_PROMPT_CLOUD_VM.md)**. Ask the agent to build/run; it clones backend and frontend (demo) into the repo if needed. Manual:

```bash
cd ~/repos/fabriq
export GH_TOKEN="your_github_token"
git clone --branch demo --depth 1 "https://${GH_TOKEN}@github.com/fabriq-labs/fabriq-base.git" backend
git clone --branch demo --depth 1 "https://${GH_TOKEN}@github.com/fabriq-labs/zeiv-v2.git" frontend-1

docker compose build
docker compose up -d
curl -s http://localhost:8080/health
```

Then open **http://34.87.77.156:8080** (first run: Postgres init + demo data can take a few minutes).

---

## 4. Useful commands

```bash
# From your Mac: SSH into VM
gcloud compute ssh fabriq-dev-vm --zone=asia-southeast1-b

# Check Docker on VM
docker --version
docker compose version

# List images
docker images | grep fabriq
```

---

## 5. Delete VM when done

```bash
gcloud compute instances delete fabriq-dev-vm --zone=asia-southeast1-b --quiet
```
