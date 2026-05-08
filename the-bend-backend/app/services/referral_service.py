"""Tenant-referral business logic."""
from uuid import UUID, uuid4
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError
from app.models.tenant import Tenant
from app.models.tenant_referral import TenantReferral
from app.models.user import User
from app.models.enums import ReferralStatus, ReferralRewardType
from app.schemas.referral import ReferralCreate, ReferralAdvance


# Reward applied automatically when a referral reaches LAUNCHED.
# Default: 6 free months.
DEFAULT_LAUNCH_REWARD_MONTHS = 6


class ReferralService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_tenant(self, tenant_id: UUID) -> list[TenantReferral]:
        result = await self.db.execute(
            select(TenantReferral)
            .where(TenantReferral.referrer_tenant_id == tenant_id)
            .order_by(TenantReferral.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_all(self, status: ReferralStatus | None = None) -> list[TenantReferral]:
        query = select(TenantReferral).order_by(TenantReferral.created_at.desc())
        if status:
            query = query.where(TenantReferral.status == status)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get(self, referral_id: UUID) -> TenantReferral:
        result = await self.db.execute(
            select(TenantReferral).where(TenantReferral.id == referral_id)
        )
        ref = result.scalar_one_or_none()
        if not ref:
            raise NotFoundError("Referral")
        return ref

    async def create(self, tenant_id: UUID, user_id: UUID, data: ReferralCreate) -> TenantReferral:
        ref = TenantReferral(
            id=uuid4(),
            referrer_tenant_id=tenant_id,
            referrer_user_id=user_id,
            referred_email=data.referred_email,
            referred_name=data.referred_name,
            referred_county_name=data.referred_county_name,
            referred_message=data.referred_message,
            status=ReferralStatus.PENDING,
            reward_type=ReferralRewardType.FREE_MONTHS,
            reward_amount=DEFAULT_LAUNCH_REWARD_MONTHS,
        )
        self.db.add(ref)
        await self.db.flush()
        await self.db.refresh(ref)
        return ref

    async def advance(self, referral_id: UUID, data: ReferralAdvance) -> TenantReferral:
        """Super admin moves status forward and optionally sets resulting tenant + grants reward."""
        ref = await self.get(referral_id)
        new_status = ReferralStatus(data.status)

        if new_status == ReferralStatus.LAUNCHED:
            if not data.resulting_tenant_id:
                raise ValidationError("resulting_tenant_id required when launching")
            try:
                tid = UUID(data.resulting_tenant_id)
            except (ValueError, AttributeError):
                raise ValidationError("resulting_tenant_id must be a UUID")
            new_tenant = await self.db.get(Tenant, tid)
            if not new_tenant:
                raise NotFoundError("Resulting tenant")

            ref.resulting_tenant_id = tid
            new_tenant.referred_by_tenant_id = ref.referrer_tenant_id

            if not ref.reward_granted_at:
                ref.reward_granted_at = datetime.utcnow()

        ref.status = new_status
        if data.super_admin_notes is not None:
            ref.super_admin_notes = data.super_admin_notes

        await self.db.flush()
        await self.db.refresh(ref)
        return ref

    async def to_response(self, ref: TenantReferral) -> dict:
        # Look up referrer tenant + user names for display
        tenant_name = None
        user_name = None
        t = await self.db.get(Tenant, ref.referrer_tenant_id)
        if t:
            tenant_name = t.display_name
        if ref.referrer_user_id:
            u = await self.db.get(User, ref.referrer_user_id)
            if u:
                user_name = u.name

        return {
            "id": str(ref.id),
            "referrer_tenant_id": str(ref.referrer_tenant_id),
            "referrer_tenant_name": tenant_name,
            "referrer_user_id": str(ref.referrer_user_id) if ref.referrer_user_id else None,
            "referrer_user_name": user_name,
            "referred_email": ref.referred_email,
            "referred_name": ref.referred_name,
            "referred_county_name": ref.referred_county_name,
            "referred_message": ref.referred_message,
            "status": ref.status.value if hasattr(ref.status, "value") else str(ref.status),
            "reward_type": ref.reward_type.value if hasattr(ref.reward_type, "value") else str(ref.reward_type),
            "reward_amount": ref.reward_amount,
            "reward_granted_at": ref.reward_granted_at.isoformat() if ref.reward_granted_at else None,
            "resulting_tenant_id": str(ref.resulting_tenant_id) if ref.resulting_tenant_id else None,
            "super_admin_notes": ref.super_admin_notes,
            "created_at": ref.created_at.isoformat(),
            "updated_at": ref.updated_at.isoformat(),
        }
