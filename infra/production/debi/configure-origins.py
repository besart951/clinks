"""Refresh only public origins in the release's private dotenv files."""
import os
from pathlib import Path

directory = Path(os.environ["CONFIG_DIR"])
api = "https://" + os.environ["API_HOST"]
jwks = api + "/.well-known/jwks.json"
origins = {
    "api.env": {"WEB_ORIGIN": "https://" + os.environ["WEB_HOST"], "API_ORIGIN": api, "TOKEN_ISSUER": api},
    "collab.env": {"TOKEN_ISSUER": api, "JWKS_URL": jwks},
    "powersync.env": {"PS_JWKS_URI": jwks},
}
for filename, values in origins.items():
    target = directory / filename
    lines = [line for line in target.read_text().splitlines() if line.partition("=")[0] not in values]
    lines.extend(f"{name}={value}" for name, value in values.items())
    staging = target.with_suffix(".env.next")
    staging.write_text("\n".join(lines) + "\n")
    staging.replace(target)
