"""Version / build info. The Docker build passes branch, commit and tag (see Dockerfile and workflow)."""
from __future__ import annotations

import os

BASE_VERSION = "0.1.0"
REPO = os.environ.get("P5_REPO", "https://github.com/p5lukas/p5assets").rstrip("/")


def info() -> dict:
    tag = (os.environ.get("P5_TAG") or "").lstrip("v")
    branch = os.environ.get("P5_BRANCH") or ""
    commit = os.environ.get("P5_COMMIT") or ""
    short = commit[:7]
    local = not (tag or branch or commit)
    if tag:
        version = tag
    elif local:
        version = f"{BASE_VERSION}-dev (lokal)"
    else:
        version = f"{BASE_VERSION}-{branch or 'dev'}" + (f"+{short}" if short else "")
    return {
        "version": version, "base": BASE_VERSION, "tag": tag, "branch": branch or ("dev (lokal)" if local else ""),
        "commit": commit, "commit_short": short, "repo": REPO,
        "branch_url": f"{REPO}/tree/{branch}" if branch and not tag else (f"{REPO}/releases/tag/v{tag}" if tag else REPO),
        "commit_url": f"{REPO}/commit/{commit}" if commit else "",
    }
