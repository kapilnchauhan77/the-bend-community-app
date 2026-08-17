import asyncio

from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.account_tasks.erase_account", bind=True, max_retries=5, default_retry_delay=60)
def erase_account(self, deletion_id: str):
    async def run():
        from app.database import async_session
        from app.services.account_deletion_service import AccountDeletionService
        async with async_session() as db:
            return await AccountDeletionService(db).erase(deletion_id)

    try:
        return asyncio.run(run())
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(name="app.workers.account_tasks.reconcile_account_deletions")
def reconcile_account_deletions(limit: int = 100):
    async def run():
        from app.database import async_session
        from app.services.account_deletion_service import AccountDeletionService
        async with async_session() as db:
            return await AccountDeletionService(db).reconcile_pending(limit)
    return asyncio.run(run())
