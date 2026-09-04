"""Exercise deployment control flow without Docker, a server, or real credentials."""
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]
REVISION = "a" * 40
BACKEND = "gcr.io/example/bend-backend@sha256:" + "b" * 64
FRONTEND = "gcr.io/example/bend-frontend@sha256:" + "c" * 64


@pytest.fixture
def deployment(tmp_path):
    shutil.copy(ROOT / "deploy.sh", tmp_path / "deploy.sh")
    shutil.copy(ROOT / "docker-compose.prod.yml", tmp_path / "docker-compose.prod.yml")
    (tmp_path / ".env").write_text("UNCHANGED_SETTING=keep-me\n")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    docker = bin_dir / "docker"
    docker.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
a = sys.argv[1:]
with open('commands.jsonl', 'a') as f:
    f.write(json.dumps({'args': a, 'backend': os.environ.get('BEND_BACKEND_IMAGE'), 'frontend': os.environ.get('BEND_FRONTEND_IMAGE')}) + '\\n')
if a[0] == 'pull' and os.environ.get('FAIL_PULL'):
    sys.exit(1)
if a[:2] == ['image', 'inspect']:
    print('a' * 40)
elif a[0] == 'inspect':
    print('sha256:' + 'd' * 64)
elif a[0] == 'compose':
    if 'ps' in a:
        print('old-' + a[-1])
    if 'up' in a:
        pathlib.Path('active-image').write_text(os.environ['BEND_BACKEND_IMAGE'])
    if 'exec' in a and os.environ.get('FAIL_HEALTH') and os.environ.get('BEND_BACKEND_IMAGE', '').startswith('gcr.io'):
        sys.exit(1)
''')
    docker.chmod(0o755)
    for name, body in {
        "git": 'if [ "$1" = rev-parse ]; then printf "%s\\n" ' + REVISION + '; fi',
        "flock": "exit 0",
        "sleep": "exit 0",
    }.items():
        path = bin_dir / name
        path.write_text("#!/bin/sh\n" + body + "\n")
        path.chmod(0o755)
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "HEALTH_ATTEMPTS": "1"}

    def run(*args, **flags):
        result = subprocess.run(
            ["bash", "deploy.sh", *args], cwd=tmp_path,
            env={**env, **flags}, text=True, capture_output=True,
        )
        log = tmp_path / "commands.jsonl"
        calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        return result, calls

    return tmp_path, run


def test_deploy_requires_immutable_digests_before_touching_docker(deployment):
    _, run = deployment
    result, calls = run(REVISION, "backend:latest", FRONTEND)
    assert result.returncode != 0
    assert calls == []


def test_deploy_pulls_finished_images_without_building_and_saves_release(deployment):
    path, run = deployment
    result, calls = run(REVISION, BACKEND, FRONTEND)
    assert result.returncode == 0, result.stderr
    assert [c["args"][1] for c in calls if c["args"][0] == "pull"] == [BACKEND, FRONTEND]
    assert not any("build" in c["args"] for c in calls)
    starts = [c for c in calls if "up" in c["args"]]
    assert len(starts) == 1
    assert "--no-build" in starts[0]["args"]
    assert "--no-deps" in starts[0]["args"]
    assert starts[0]["backend"] == BACKEND
    assert starts[0]["frontend"] == FRONTEND
    assert all(s in starts[0]["args"] for s in ["backend", "frontend", "celery-worker", "celery-beat"])
    assert BACKEND in (path / ".release.env").read_text()
    assert "bend-rollback/backend" in (path / ".release.previous.env").read_text()
    assert (path / ".env").read_text() == "UNCHANGED_SETTING=keep-me\n"


def test_pull_failure_leaves_running_release_alone(deployment):
    path, run = deployment
    result, calls = run(REVISION, BACKEND, FRONTEND, FAIL_PULL="1")
    assert result.returncode != 0
    assert not any("up" in c["args"] for c in calls)
    assert not (path / ".release.env").exists()


def test_failed_health_restores_previous_images(deployment):
    path, run = deployment
    (path / ".release.env").write_text("PREVIOUS_RELEASE=untouched\n")
    result, calls = run(REVISION, BACKEND, FRONTEND, FAIL_HEALTH="1")
    assert result.returncode != 0
    starts = [c for c in calls if "up" in c["args"]]
    assert len(starts) == 2
    assert starts[-1]["backend"].startswith("bend-rollback/backend:")
    assert starts[-1]["frontend"].startswith("bend-rollback/frontend:")
    assert (path / ".release.env").read_text() == "PREVIOUS_RELEASE=untouched\n"
