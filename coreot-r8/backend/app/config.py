"""Settings, read from environment variables (or a .env file next to the backend)."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


def _load_dotenv() -> None:
    env = BACKEND_DIR / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


def _secret() -> str:
    """Use COREOT_SECRET_KEY; otherwise keep a generated key in data/ so restarts keep sessions."""
    if os.environ.get("COREOT_SECRET_KEY"):
        return os.environ["COREOT_SECRET_KEY"]
    path = Path(os.environ.get("COREOT_DATA_DIR", PROJECT_DIR / "data")) / ".secret_key"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(secrets.token_urlsafe(48))
    return path.read_text().strip()


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("COREOT_DATA_DIR", PROJECT_DIR / "data")))
    database_url: str = field(default_factory=lambda: os.environ.get("COREOT_DATABASE_URL", ""))
    frontend_dir: Path = field(default_factory=lambda: Path(os.environ.get("COREOT_FRONTEND_DIR", PROJECT_DIR / "frontend")))
    secret_key: str = field(default_factory=_secret)
    token_hours: int = field(default_factory=lambda: int(os.environ.get("COREOT_TOKEN_HOURS", "12")))
    demo_password: str = field(default_factory=lambda: os.environ.get("COREOT_DEMO_PASSWORD", "CoreOT@2026"))
    simulator: bool = field(default_factory=lambda: _bool("COREOT_SIMULATOR", True))
    sim_interval: float = field(default_factory=lambda: float(os.environ.get("COREOT_SIM_INTERVAL", "2")))
    history_every: int = field(default_factory=lambda: int(os.environ.get("COREOT_HISTORY_EVERY", "60")))
    history_days: int = field(default_factory=lambda: int(os.environ.get("COREOT_HISTORY_DAYS", "30")))
    excursion_every: int = field(default_factory=lambda: int(os.environ.get("COREOT_EXCURSION_EVERY", "180")))
    max_upload_mb: int = field(default_factory=lambda: int(os.environ.get("COREOT_MAX_UPLOAD_MB", "25")))
    plant_name: str = field(default_factory=lambda: os.environ.get("COREOT_PLANT", "Nashik Plant"))

    def __post_init__(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        (self.data_dir / "files").mkdir(exist_ok=True)
        if not self.database_url:
            self.database_url = f"sqlite:///{self.data_dir / 'coreot.db'}"

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"


settings = Settings()
