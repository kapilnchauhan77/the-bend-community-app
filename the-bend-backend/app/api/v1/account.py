from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.permissions import get_current_tenant, get_current_user
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.account import AccountDeletionConfirm, AccountDeletionConfirmation, AccountDeletionStatus
from app.services.account_deletion_service import AccountDeletionService

router = APIRouter(prefix="/account/deletion", tags=["Account"])


@router.post("/confirm", response_model=AccountDeletionConfirmation)
async def confirm(data: AccountDeletionConfirm, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), tenant: Tenant | None = Depends(get_current_tenant)):
    if tenant is None or current_user.tenant_id != tenant.id:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Deletion status")
    from app.workers.account_tasks import erase_account
    deletion, receipt = await AccountDeletionService(db, queue=erase_account).confirm(current_user, data.password, data.send_confirmation)
    return {"deletion_id": str(deletion.id), "status": deletion.status, "status_receipt": receipt}


@router.get("/status", response_model=AccountDeletionStatus)
async def status(receipt: str = Query(..., min_length=1, max_length=256), db: AsyncSession = Depends(get_db), tenant: Tenant | None = Depends(get_current_tenant)):
    if tenant is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Deletion status")
    row = await AccountDeletionService(db).consume_terminal_receipt(receipt, tenant.id if tenant else None)
    return {"status": row.status, "requested_at": row.created_at, "completed_at": row.completed_at}
