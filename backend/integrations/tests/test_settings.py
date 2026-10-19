import os

from shared.settings import ensure_db_env_from_database_url


def test_database_url_derives_db_star(monkeypatch):
    for key in ("DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://kernel%40x:s%40cret@db.example:6543/kernel_app",
    )
    ensure_db_env_from_database_url()
    assert os.environ["DB_HOST"] == "db.example"
    assert os.environ["DB_PORT"] == "6543"
    assert os.environ["DB_USER"] == "kernel@x"
    assert os.environ["DB_PASSWORD"] == "s@cret"
    assert os.environ["DB_NAME"] == "kernel_app"
