from __future__ import annotations

import json
import os
import shlex
import subprocess
import tomllib
from pathlib import Path, PurePosixPath

import yaml


BACKEND = Path(__file__).resolve().parents[1]
REPOSITORY = BACKEND.parent


def _docker_environment(dockerfile: str) -> dict[str, str]:
    environment: dict[str, str] = {}
    for line in dockerfile.splitlines():
        if not line.startswith("ENV "):
            continue
        key, value = line.removeprefix("ENV ").split("=", 1)
        environment[key] = value.strip('"')
    return environment


def _compose_mount_targets(compose_path: Path) -> set[PurePosixPath]:
    compose = yaml.safe_load(compose_path.read_text())
    targets: set[PurePosixPath] = set()
    for service in compose["services"].values():
        for volume in service.get("volumes", []):
            if isinstance(volume, str):
                parts = volume.split(":")
                targets.add(PurePosixPath(parts[1]))
            else:
                targets.add(PurePosixPath(volume["target"]))
    return targets


def _command_executable(command: str | list[str]) -> str:
    tokens = command if isinstance(command, list) else shlex.split(command)
    return tokens[0]


def _docker_command(dockerfile: str) -> list[str]:
    command_line = next(
        line.removeprefix("CMD ")
        for line in dockerfile.splitlines()
        if line.startswith("CMD ")
    )
    return json.loads(command_line)


def _application_commands_in_script(script_path: Path) -> set[str]:
    shell_syntax = {"echo", "export", "fi", "if", "set"}
    commands: set[str] = set()
    for raw_line in script_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        tokens = shlex.split(line)
        if tokens[0] == "exec":
            tokens = tokens[1:]
        if tokens[0] not in shell_syntax:
            commands.add(tokens[0])
    return commands


def test_image_environment_survives_the_development_source_mount() -> None:
    dockerfile = (BACKEND / "Dockerfile").read_text()
    environment = _docker_environment(dockerfile)

    project_environment = environment.get("UV_PROJECT_ENVIRONMENT")
    assert project_environment == "/opt/venv"
    assert environment.get("PATH", "").split(":", 1)[0] == "/opt/venv/bin"

    source_mount = PurePosixPath("/app")
    mount_targets = _compose_mount_targets(BACKEND / "docker-compose.yml")
    assert source_mount in mount_targets
    assert not PurePosixPath(project_environment).is_relative_to(source_mount)


def test_frozen_environment_runs_every_configured_application_entrypoint(
    tmp_path: Path,
) -> None:
    dockerfile = (BACKEND / "Dockerfile").read_text()
    image_command = _docker_command(dockerfile)
    image_executable = image_command[0]
    assert "/" not in image_executable, (
        "the image command must resolve through the production virtual environment PATH"
    )

    production_compose = yaml.safe_load(
        (REPOSITORY / "docker-compose.prod.yml").read_text()
    )
    development_compose = yaml.safe_load((BACKEND / "docker-compose.yml").read_text())
    railway = tomllib.loads((BACKEND / "railway.toml").read_text())

    start_script = Path(
        production_compose["services"]["backend"]["command"][0]
    ).name
    railway_start = shlex.split(railway["deploy"]["startCommand"])
    assert railway_start == ["sh", start_script]

    application_commands = {image_executable}
    application_commands.update(
        _command_executable(production_compose["services"][service]["command"])
        for service in ("celery-worker", "celery-beat")
    )
    application_commands.update(
        _command_executable(development_compose["services"][service]["command"])
        for service in ("api", "celery-worker", "celery-beat")
    )
    application_commands.update(
        _application_commands_in_script(BACKEND / start_script)
    )
    assert application_commands == {"alembic", "celery", "python", "uvicorn"}

    project_environment = tmp_path / "opt" / "venv"
    sync_environment = os.environ.copy()
    sync_environment.pop("VIRTUAL_ENV", None)
    sync_environment["UV_PROJECT_ENVIRONMENT"] = str(project_environment)
    sync = subprocess.run(
        [
            "uv",
            "sync",
            "--frozen",
            "--no-dev",
            "--no-editable",
            "--python",
            "3.11",
            "--no-progress",
        ],
        cwd=BACKEND,
        env=sync_environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert sync.returncode == 0, sync.stderr

    executable_directory = project_environment / "bin"
    for application_command in sorted(application_commands):
        result = subprocess.run(
            [str(executable_directory / application_command), "--version"],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, (
            f"{application_command} did not run from the frozen production environment: "
            f"{result.stderr}"
        )

    installed_project = subprocess.run(
        [
            str(executable_directory / "python"),
            "-c",
            (
                "import app, bcrypt, json; "
                "print(json.dumps({'app': app.__file__, 'bcrypt': bcrypt.__version__}))"
            ),
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert installed_project.returncode == 0, installed_project.stderr
    installed = json.loads(installed_project.stdout)
    assert Path(installed["app"]).is_relative_to(project_environment)
    assert installed["bcrypt"] == "4.0.1"
    assert not (executable_directory / "pytest").exists()


def test_uv_lock_is_current_and_covers_runtime_and_test_dependencies() -> None:
    pyproject = tomllib.loads((BACKEND / "pyproject.toml").read_text())

    project = pyproject["project"]
    assert project["name"] == "the-bend-backend"
    assert any(dependency.startswith("aiohttp") for dependency in project["dependencies"])
    assert any(dependency.startswith("pytest") for dependency in pyproject["dependency-groups"]["dev"])
    assert pyproject["build-system"]["requires"] == ["poetry-core==2.4.1"]
    assert "dependencies" not in pyproject["tool"]["poetry"]

    result = subprocess.run(
        ["uv", "lock", "--check"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr

    lock = (BACKEND / "uv.lock").read_text()
    assert "[[package]]" in lock
    assert 'name = "aiohttp"' in lock
    assert 'version = "3.14.' in lock


def test_image_build_selects_the_frozen_production_environment() -> None:
    dockerfile = (BACKEND / "Dockerfile").read_text()

    assert "uv==0.10.4" in dockerfile
    assert "uv sync --frozen --no-dev --no-editable" in dockerfile
    assert "pip install --no-cache-dir ." not in dockerfile
