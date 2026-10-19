import base64
import os

from shared.encryption import decrypt_config, encrypt_config


def test_encrypt_decrypt_roundtrip():
    os.environ["ERP_CONFIG_ENCRYPTION_KEY"] = base64.b64encode(b"0123456789abcdef0123456789abcdef").decode()
    payload = {"oauth": {"client_id": "cid", "refresh_token": "rt"}}
    blob = encrypt_config(payload)
    assert ":" in blob
    assert decrypt_config(blob) == payload
