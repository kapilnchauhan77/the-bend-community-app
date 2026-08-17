"""Worker startup must register every non-standard task module."""

import json
import os
import subprocess
import sys
from pathlib import Path


def test_celery_app_import_registers_push_and_account_tasks_and_beat_entries():
    root = Path(__file__).resolve().parents[1]
    script = """
import json
from app.workers.celery_app import celery_app
print(json.dumps({
    'tasks': sorted(name for name in celery_app.tasks if name.startswith('app.workers.')),
    'beat': {name: entry['task'] for name, entry in celery_app.conf.beat_schedule.items()},
}))
"""
    env = os.environ.copy()
    result = subprocess.run([sys.executable, "-c", script], cwd=root, env=env, capture_output=True, text=True, check=True)
    payload = json.loads(result.stdout.strip().splitlines()[-1])
    assert "app.workers.push_tasks.dispatch_push_outbox" in payload["tasks"]
    assert "app.workers.account_tasks.erase_account" in payload["tasks"]
    assert "app.workers.account_tasks.reconcile_account_deletions" in payload["tasks"]
    assert payload["beat"]["dispatch-push-outbox"] == "app.workers.push_tasks.dispatch_push_outbox"
    assert payload["beat"]["reconcile-account-deletions"] == "app.workers.account_tasks.reconcile_account_deletions"
