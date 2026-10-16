# Railway: pull from Artifact Registry + Vertex (Gemini)

Fabriq’s backend uses **Vertex AI** via `@ai-sdk/google-vertex` ([`backend/src/lib/ai/vertexProvider.ts`](../backend/src/lib/ai/vertexProvider.ts)). That stack expects **Google Application Default Credentials (ADC)** in practice: either a **metadata server** (Cloud Run/GCE) or **`GOOGLE_APPLICATION_CREDENTIALS`** pointing at a **service account JSON key file**.

Railway is **not** on GCP, so there is **no metadata-based ADC**. You must supply credentials explicitly (see below).

---

## 1. How Railway can pull your Docker image (Artifact Registry)

Railway can run a **pre-built image** from a **private** registry if you configure registry authentication.

**GitHub Container Registry (GHCR):** if you build with **GitHub Actions** (`.github/workflows/docker-ghcr.yml`), use `ghcr.io/<owner>/<repo>:<tag>` and configure Railway with **GitHub** / PAT-based auth for GHCR. Overview: [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md) (§ GitHub Actions → GHCR).

### Image reference (Google Artifact Registry, optional)

If you use **Artifact Registry** instead of GHCR, use the image URL from your registry, for example:

`us-central1-docker.pkg.dev/PROJECT_ID/fabriq/fabriq:latest`

(or a specific tag such as `fabriq:20250319-143022`)

### GCP: service account for “pull only”

1. Create a service account (e.g. `railway-image-puller@PROJECT_ID.iam.gserviceaccount.com`).
2. Grant **`roles/artifactregistry.reader`** on the project (or on the Artifact Registry repository).
3. Create a **JSON key** for that SA (IAM → Service accounts → Keys → Add JSON). Store it securely; treat it like a password.

### Docker / Artifact Registry auth (what Railway is doing under the hood)

Google’s Docker login for JSON keys uses:

- **Registry / host:** `REGION-docker.pkg.dev` (e.g. `us-central1-docker.pkg.dev`)
- **Username:** `_json_key`
- **Password:** the **entire contents** of the JSON key file (one line is fine)

### Railway UI (typical flow)

1. Create a **new service** → choose **Empty** or **Deploy Docker image** (wording varies by Railway UI version).
2. Set **image** to:  
   `REGION-docker.pkg.dev/PROJECT_ID/REPO/IMAGE:tag`  
   Example: `us-central1-docker.pkg.dev/my-project/fabriq/fabriq:latest`
3. Add **private registry** credentials when prompted:
   - **Server / registry URL:** `https://REGION-docker.pkg.dev` (or the host Railway asks for)
   - **Username:** `_json_key`
   - **Password:** paste the **full JSON** key (puller SA)

If Railway splits “registry” vs “image path”, follow their docs; the important part is **GAR + `_json_key` + JSON body**.

### Simpler alternative

Push the same image to **GitHub Container Registry** or **Docker Hub** from CI and point Railway there—often fewer moving parts than GAR from outside GCP.

---

## 2. How Railway can use “ADC” for Gemini (Vertex)

### What ADC means here

- **On Cloud Run / GCE:** ADC uses the **attached service account** via the metadata server (no key file in the container).
- **On Railway:** there is **no** GCP metadata server, so **that** ADC path does **not** exist.

The Vertex SDK still uses Google’s auth library; you satisfy it by providing a **service account key file** and pointing ADC at it.

### Recommended: `GOOGLE_APPLICATION_CREDENTIALS` + key file

1. Create a **different** service account for the **app runtime** (not the puller), e.g. `fabriq-vertex@PROJECT_ID.iam.gserviceaccount.com`.
2. Grant at least:
   - **`roles/aiplatform.user`** (Vertex AI / Gemini calls)
   - Any other roles your app needs (e.g. **Storage** if `STORAGE_TYPE=gcs` uses the same identity)
3. Create a **JSON key** for this runtime SA.
4. On Railway, you cannot usually upload a file as a path; common patterns:
   - **A)** Store the JSON as a **secret variable** (e.g. `GCP_SA_JSON`) and use a **start command** that writes it to disk then starts the app:
     ```bash
     echo "$GCP_SA_JSON" > /tmp/gcp-sa.json && export GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcp-sa.json && exec ./your-start.sh
     ```
   - **B)** If Railway supports mounting a secret as a file, set **`GOOGLE_APPLICATION_CREDENTIALS`** to that path (preferred when available).

5. Set env vars the app already expects:
   - **`GOOGLE_CLOUD_PROJECT_ID`** (or `GOOGLE_CLOUD_PROJECT` if your code reads that—align with app)
   - **`GOOGLE_LOCATION`** (e.g. `us-central1`) — see [`vertexProvider.ts`](../backend/src/lib/ai/vertexProvider.ts)

After this, libraries treat the key file as **ADC** for application purposes.

### Security notes

- **Rotate** keys if exposed; prefer **separate** SAs for image pull vs runtime.
- **Minimize** roles on each SA.
- Long term, consider **Workload Identity Federation** (no long-lived JSON keys) with a custom token flow—more setup, better security.

### Alternative: Google AI Studio API key (not Vertex)

Using the **Generative Language API** with an **API key** is a different product path and would require **code changes** away from `@ai-sdk/google-vertex`. This doc assumes you stay on **Vertex** as the codebase does today.

---

## Quick checklist

| Goal | Railway / GCP action |
|------|----------------------|
| Pull image from GAR | Puller SA + `artifactregistry.reader` + registry auth username `_json_key`, password = JSON |
| Call Gemini on Vertex | Runtime SA + `aiplatform.user` + `GOOGLE_APPLICATION_CREDENTIALS` (file from secret at startup) |
| Match local “ADC” dev | Local: `gcloud auth application-default login`; Railway: SA JSON + `GOOGLE_APPLICATION_CREDENTIALS` |

---

## Related docs

- [BUILD_AND_DEPLOY.md](./BUILD_AND_DEPLOY.md) — Monorepo **Dockerfile**; CI via **GHCR** (GitHub Actions). Railway: build from Git using root Dockerfile (no clone token).
