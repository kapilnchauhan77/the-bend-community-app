from __future__ import annotations
from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError, ValidationError
from app.models.report import Report
from app.models.report_audit import ReportAudit
from app.models.listing import Listing
from app.models.shop import Shop
from app.models.event import Event
from app.models.bender import BenderPost
from app.models.user import User
from app.models.message import Message, MessageThread

TARGETS = {"listing": Listing, "shop": Shop, "event": Event, "bender": BenderPost, "user": User, "message": Message}
REASONS = {"spam", "inappropriate", "misleading", "harassment", "other"}

class ReportService:
    def __init__(self, db: AsyncSession): self.db = db

    async def _target(self, target_type: str, target_id: UUID, tenant_id: UUID | None, reporter_id: UUID | None = None):
        model = TARGETS.get(target_type)
        if not model: raise ValidationError("Unsupported report target")
        q = select(model).where(model.id == target_id)
        if tenant_id is None: raise NotFoundError("Target")
        if hasattr(model, "tenant_id"): q = q.where(model.tenant_id == tenant_id)
        row = (await self.db.execute(q)).scalar_one_or_none()
        if not row: raise NotFoundError("Target")
        if target_type == "user" and reporter_id == target_id: raise NotFoundError("Target")
        if target_type == "message":
            thread = (await self.db.execute(select(MessageThread).where(MessageThread.id == row.thread_id, (MessageThread.tenant_id == tenant_id) | MessageThread.tenant_id.is_(None)))).scalar_one_or_none()
            if not thread or reporter_id not in (thread.participant_a, thread.participant_b): raise NotFoundError("Target")
        return row

    async def create(self, target_type: str, target_id: UUID, reason: str, details: str | None, reporter_id: UUID, tenant_id: UUID | None):
        if tenant_id is None or reason not in REASONS: raise ValidationError("Invalid report")
        await self._target(target_type, target_id, tenant_id, reporter_id)
        details = details.strip()[:1000] if details else None
        stmt = insert(Report).values(id=uuid4(), target_type=target_type, target_id=target_id, reporter_id=reporter_id, tenant_id=tenant_id, reason=reason, details=details, status="open", resolved=False).on_conflict_do_nothing(constraint="uq_reports_reporter_target")
        await self.db.execute(stmt)
        row = (await self.db.execute(select(Report).where(Report.tenant_id == tenant_id, Report.reporter_id == reporter_id, Report.target_type == target_type, Report.target_id == target_id))).scalar_one()
        return row, False

    async def resolve(self, report_id: UUID, actor_id: UUID, tenant_id: UUID | None, action: str = "resolved"):
        row = (await self.db.execute(select(Report).where(Report.id == report_id, Report.tenant_id == tenant_id).with_for_update())).scalar_one_or_none()
        if not row: raise NotFoundError("Report")
        if row.status != "resolved":
            row.status, row.resolved, row.resolved_at, row.resolved_by_id = "resolved", True, datetime.utcnow(), actor_id
            self.db.add(ReportAudit(id=uuid4(), report_id=row.id, tenant_id=tenant_id, actor_id=actor_id, action=action))
            await self.db.flush()
        return row

    async def list_admin(self, tenant_id: UUID | None, resolved: bool | None = None):
        q = select(Report).where(Report.tenant_id == tenant_id).order_by(Report.created_at.desc()).limit(50)
        if resolved is not None: q = q.where(Report.status == ("resolved" if resolved else "open"))
        rows = (await self.db.execute(q)).scalars().all(); items = []
        for row in rows:
            target = None
            try: target = await self._target(row.target_type, row.target_id, tenant_id)
            except NotFoundError: pass
            items.append({"id": str(row.id), "target_type": row.target_type, "target_id": str(row.target_id), "target_summary": {"id": str(target.id), "title": getattr(target, "title", getattr(target, "name", None))} if target else {"unavailable": True}, "reason": row.reason, "details": row.details, "status": row.status, "resolved": row.status == "resolved", "resolved_at": row.resolved_at, "resolved_by_id": str(row.resolved_by_id) if row.resolved_by_id else None, "created_at": str(row.created_at)})
        return {"items": items}
