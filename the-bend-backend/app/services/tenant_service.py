from uuid import uuid4, UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.user import User
from app.models.shop import Shop
from app.models.listing import Listing
from app.models.event import Event
from app.models.enums import UserRole, ShopStatus, ListingStatus, EventStatus
from app.schemas.tenant import TenantCreate, TenantUpdate


class TenantService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_tenants(self) -> list[Tenant]:
        result = await self.db.execute(select(Tenant).order_by(Tenant.created_at.desc()))
        return list(result.scalars().all())

    async def get_tenant(self, tenant_id: UUID) -> Tenant:
        result = await self.db.execute(select(Tenant).where(Tenant.id == tenant_id))
        tenant = result.scalar_one_or_none()
        if not tenant:
            raise NotFoundError("Tenant")
        return tenant

    async def get_tenant_by_slug(self, slug: str) -> Tenant | None:
        result = await self.db.execute(
            select(Tenant).where(Tenant.slug == slug, Tenant.is_active == True)
        )
        return result.scalar_one_or_none()

    async def create_tenant(self, data: TenantCreate) -> Tenant:
        # Check uniqueness
        existing = await self.db.execute(
            select(Tenant).where((Tenant.slug == data.slug) | (Tenant.subdomain == data.subdomain))
        )
        if existing.scalar_one_or_none():
            raise ConflictError("Tenant with this slug or subdomain already exists")

        tenant = Tenant(
            id=uuid4(),
            slug=data.slug,
            subdomain=data.subdomain,
            display_name=data.display_name,
            tagline=data.tagline,
            about_text=data.about_text,
            hero_image_url=data.hero_image_url,
            logo_url=data.logo_url,
            primary_color=data.primary_color,
            footer_text=data.footer_text,
        )
        self.db.add(tenant)
        await self.db.flush()
        await self.db.refresh(tenant)
        return tenant

    async def update_tenant(self, tenant_id: UUID, data: TenantUpdate) -> Tenant:
        tenant = await self.get_tenant(tenant_id)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(tenant, key, value)
        await self.db.flush()
        await self.db.refresh(tenant)
        return tenant

    async def deactivate_tenant(self, tenant_id: UUID, hard_delete: bool = False) -> Tenant | None:
        tenant = await self.get_tenant(tenant_id)
        if hard_delete:
            await self.db.delete(tenant)
            await self.db.flush()
            return None
        tenant.is_active = False
        await self.db.flush()
        return tenant

    async def create_community_admin(self, tenant_id: UUID, email: str, password: str, name: str) -> User:
        tenant = await self.get_tenant(tenant_id)

        # Check email uniqueness
        existing = await self.db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            raise ConflictError("Email already registered")

        user = User(
            id=uuid4(),
            email=email,
            password_hash=hash_password(password),
            name=name,
            role=UserRole.COMMUNITY_ADMIN,
            tenant_id=tenant.id,
            is_active=True,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def get_tenant_stats(self, tenant_id: UUID) -> dict:
        active_shops = (await self.db.execute(
            select(func.count()).select_from(Shop).where(
                Shop.tenant_id == tenant_id, Shop.status == ShopStatus.ACTIVE
            )
        )).scalar_one()

        active_listings = (await self.db.execute(
            select(func.count()).select_from(Listing).where(
                Listing.tenant_id == tenant_id, Listing.status == ListingStatus.ACTIVE
            )
        )).scalar_one()

        total_users = (await self.db.execute(
            select(func.count()).select_from(User).where(User.tenant_id == tenant_id)
        )).scalar_one()

        total_events = (await self.db.execute(
            select(func.count()).select_from(Event).where(
                Event.tenant_id == tenant_id, Event.status == EventStatus.ACTIVE
            )
        )).scalar_one()

        return {
            "tenant_id": str(tenant_id),
            "active_shops": active_shops,
            "active_listings": active_listings,
            "total_users": total_users,
            "total_events": total_events,
        }
