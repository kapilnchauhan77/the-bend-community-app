from __future__ import annotations
from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import NotFoundError, ValidationError
from app.models.report import Report
from app.models.report_audit import ReportAudit
from app.models.listing import Listing
from app.models.shop import Shop
from app.models.event import Event
from app.models.bender import BenderPost
from app.models.enums import UserRole
from app.models.user import User
from app.models.message import Message, MessageThread

TARGETS = {
    "listing": Listing,
    "shop": Shop,
    "event": Event,
    "bender": BenderPost,
    "user": User,
    "message": Message,
}
REASONS = {"spam", "inappropriate", "misleading", "harassment", "other"}


class ReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _target(
        self,
        target_type: str,
        target_id: UUID,
        tenant_id: UUID | None,
        reporter_id: UUID | None = None,
        enforce_participant: bool = True,
    ):
        model = TARGETS.get(target_type)
        if not model:
            raise ValidationError("Unsupported report target")
        q = select(model).where(model.id == target_id)
        if tenant_id is None:
            raise NotFoundError("Target")
        if hasattr(model, "tenant_id"):
            q = q.where(model.tenant_id == tenant_id)
        row = (await self.db.execute(q)).scalar_one_or_none()
        if not row:
            raise NotFoundError("Target")
        if target_type == "user" and reporter_id == target_id:
            raise NotFoundError("Target")
        if target_type == "message":
            thread = (
                await self.db.execute(
                    select(MessageThread).where(
                        MessageThread.id == row.thread_id,
                        (MessageThread.tenant_id == tenant_id)
                        | MessageThread.tenant_id.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if not thread or (
                enforce_participant
                and reporter_id not in (thread.participant_a, thread.participant_b)
            ):
                raise NotFoundError("Target")
        return row

    async def create(
        self,
        target_type: str,
        target_id: UUID,
        reason: str,
        details: str | None,
        reporter_id: UUID,
        tenant_id: UUID | None,
    ):
        if tenant_id is None or reason not in REASONS:
            raise ValidationError("Invalid report")
        await self._target(target_type, target_id, tenant_id, reporter_id)
        details = details.strip()[:1000] if details else None
        candidate_id = uuid4()
        stmt = (
            insert(Report)
            .values(
                id=candidate_id,
                target_type=target_type,
                target_id=target_id,
                reporter_id=reporter_id,
                tenant_id=tenant_id,
                reason=reason,
                details=details,
                status="open",
                resolved=False,
            )
            .on_conflict_do_nothing(
                index_elements=["tenant_id", "reporter_id", "target_type", "target_id"],
                index_where=text("status = 'open'"),
            )
            .returning(Report.id)
        )
        won = (await self.db.execute(stmt)).scalar_one_or_none() is not None
        row = (
            await self.db.execute(
                select(Report).where(
                    Report.tenant_id == tenant_id,
                    Report.reporter_id == reporter_id,
                    Report.target_type == target_type,
                    Report.target_id == target_id,
                )
            )
        ).scalar_one()
        return row, not won

    async def resolve(
        self,
        report_id: UUID,
        actor_id: UUID,
        tenant_id: UUID | None,
        action: str = "resolved",
    ):
        actor = (
            await self.db.execute(select(User).where(User.id == actor_id))
        ).scalar_one_or_none()
        tenant_actor = bool(
            actor
            and actor.role == UserRole.COMMUNITY_ADMIN
            and actor.tenant_id == tenant_id
        )
        platform_actor = bool(
            actor and actor.role == UserRole.SUPER_ADMIN and actor.tenant_id is None
        )
        if tenant_id is None or not (tenant_actor or platform_actor):
            raise NotFoundError("Report")
        row = (
            await self.db.execute(
                select(Report)
                .where(Report.id == report_id, Report.tenant_id == tenant_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if not row:
            raise NotFoundError("Report")
        if row.status != "resolved":
            row.status, row.resolved, row.resolved_at = (
                "resolved",
                True,
                datetime.utcnow(),
            )
            row.resolved_by_id = actor_id if tenant_actor else None
            row.resolved_by_platform_admin_id = actor_id if platform_actor else None
            self.db.add(
                ReportAudit(
                    id=uuid4(),
                    report_id=row.id,
                    tenant_id=tenant_id,
                    actor_id=actor_id if tenant_actor else None,
                    platform_actor_id=actor_id if platform_actor else None,
                    action=action,
                )
            )
            await self.db.flush()
        return row

    async def list_admin(self, tenant_id: UUID | None, resolved: bool | None = None):
        q = (
            select(Report)
            .where(Report.tenant_id == tenant_id)
            .order_by(Report.created_at.desc())
            .limit(50)
        )
        if resolved is not None:
            q = q.where(Report.status == ("resolved" if resolved else "open"))
        rows = (await self.db.execute(q)).scalars().all()
        items = []
        report_ids = [row.id for row in rows]
        audits = (
            (
                await self.db.execute(
                    select(ReportAudit).where(
                        ReportAudit.report_id.in_(report_ids),
                        ReportAudit.tenant_id == tenant_id,
                    )
                )
            )
            .scalars()
            .all()
            if report_ids
            else []
        )
        actor_ids = {row.reporter_id for row in rows} | {
            actor_id
            for audit in audits
            if (actor_id := audit.actor_id or audit.platform_actor_id)
        }
        actors = {}
        if actor_ids:
            actors = {
                user.id: user
                for user in (
                    await self.db.execute(select(User).where(User.id.in_(actor_ids)))
                )
                .scalars()
                .all()
            }
        audits_by_report = {}
        for audit in audits:
            audits_by_report.setdefault(audit.report_id, []).append(audit)
        for row in rows:
            target = None
            try:
                target = await self._target(
                    row.target_type, row.target_id, tenant_id, enforce_participant=False
                )
            except NotFoundError:
                pass
            summary = (
                {"id": str(target.id), "target_type": row.target_type}
                if target
                else {"unavailable": True, "target_type": row.target_type}
            )
            if target and row.target_type != "message":
                summary["title"] = getattr(
                    target, "title", getattr(target, "name", None)
                )
            reporter = actors.get(row.reporter_id)
            resolver_id = row.resolved_by_id or row.resolved_by_platform_admin_id
            items.append(
                {
                    "id": str(row.id),
                    "target_type": row.target_type,
                    "target_id": str(row.target_id),
                    "target_summary": summary,
                    "reason": row.reason,
                    "details": row.details,
                    "status": row.status,
                    "resolved": row.status == "resolved",
                    "resolved_at": row.resolved_at,
                    "resolved_by_id": str(resolver_id) if resolver_id else None,
                    "created_at": str(row.created_at),
                    "reporter": {
                        "id": str(row.reporter_id),
                        "display_name": reporter.name if reporter else "Deleted member",
                    },
                    "audit_actors": [
                        {
                            "id": str(actor_id),
                            "display_name": actors.get(actor_id).name
                            if actors.get(actor_id)
                            else "Deleted member",
                        }
                        for audit in audits_by_report.get(row.id, [])
                        if (actor_id := audit.actor_id or audit.platform_actor_id)
                    ],
                }
            )
        return {"items": items}
