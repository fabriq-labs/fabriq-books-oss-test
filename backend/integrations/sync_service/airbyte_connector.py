"""
Airbyte Public API (Cloud): client credentials token + sync job + poll.

Credentials come from source_system.extraction_config (loaded by extraction_config_loader),
not from process environment (except optional AIRBYTE_API_BASE override).
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)

DEFAULT_API_BASE = "https://api.airbyte.com"


class AirbyteConnector:
    """Thin client for Airbyte Public API using application client_id / client_secret."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        api_base: Optional[str] = None,
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.api_base = (api_base or os.getenv("AIRBYTE_API_BASE", DEFAULT_API_BASE)).rstrip("/")

    def get_access_token(self) -> str:
        url = f"{self.api_base}/v1/applications/token"
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant-type": "client_credentials",
        }
        r = requests.post(url, json=payload, timeout=60)
        r.raise_for_status()
        data = r.json()
        token = data.get("access_token")
        if not token:
            raise RuntimeError(f"Airbyte token response missing access_token: {data}")
        return token

    def start_sync_job(self, airbyte_connection_id: str, access_token: str) -> str:
        url = f"{self.api_base}/v1/jobs"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        body = {"connectionId": airbyte_connection_id, "jobType": "sync"}
        r = requests.post(url, json=body, headers=headers, timeout=120)
        r.raise_for_status()
        data = r.json()
        job_id = data.get("jobId") or data.get("job", {}).get("id")
        if not job_id:
            job_id = data.get("id")
        if not job_id:
            raise RuntimeError(f"Unexpected Airbyte create job response: {data}")
        return str(job_id)

    def get_job(self, job_id: str, access_token: str) -> dict[str, Any]:
        url = f"{self.api_base}/v1/jobs/{job_id}"
        headers = {"Authorization": f"Bearer {access_token}"}
        r = requests.get(url, headers=headers, timeout=60)
        r.raise_for_status()
        return r.json()

    def poll_job_until_done(
        self,
        job_id: str,
        access_token: str,
        *,
        poll_interval_sec: float = 5.0,
        max_wait_sec: float = 7200.0,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + max_wait_sec
        last: dict[str, Any] = {}
        while time.monotonic() < deadline:
            last = self.get_job(job_id, access_token)
            status = (
                last.get("status")
                or last.get("job", {}).get("status")
                or last.get("job", {}).get("state", {}).get("status")
            )
            if isinstance(status, dict):
                status = status.get("status") or status.get("state")
            logger.info("Airbyte job %s status=%s", job_id, status)
            if status in ("succeeded", "success", "completed"):
                return last
            if status in ("failed", "cancelled", "canceled"):
                raise RuntimeError(f"Airbyte job {job_id} ended with status={status}: {last}")
            time.sleep(poll_interval_sec)
        raise TimeoutError(f"Airbyte job {job_id} did not finish within {max_wait_sec}s: {last}")

    def run_connection_sync(self, airbyte_connection_id: str) -> dict[str, Any]:
        access_token = self.get_access_token()
        job_id = self.start_sync_job(airbyte_connection_id, access_token)
        final = self.poll_job_until_done(job_id, access_token)
        return {"job_id": job_id, "final": final}
