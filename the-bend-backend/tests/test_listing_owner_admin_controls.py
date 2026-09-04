from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.v1.admin import remove_listing as admin_remove_listing
from app.api.v1.listings import _serialize_listing, get_listing, my_listings
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.enums import ListingStatus, UrgencyLevel, UserRole
from app.schemas.admin import AdminListingDeleteRequest
from app.schemas.listing import ListingDetailResponse, ListingUpdate
from app.services.admin_service import AdminService
from app.services.listing_service import ListingService, can_fulfill_listing, can_manage_listing


def user(role, *, tenant_id=None, shop_id=None, user_id=None):
    return SimpleNamespace(
        id=user_id or uuid4(), role=role, tenant_id=tenant_id, shop_id=shop_id,
    )


def listing(*, tenant_id, shop_id=None, posted_by_user_id=None, status=ListingStatus.ACTIVE):
    return SimpleNamespace(
        id=uuid4(), tenant_id=tenant_id, shop_id=shop_id,
        posted_by_user_id=posted_by_user_id, status=status,
        urgency=UrgencyLevel.URGENT, title="Original title",
    )


def test_permission_matrix_owner_admin_tenant_and_super_admin():
    tenant_a, tenant_b = uuid4(), uuid4()
    owner = user(UserRole.SHOP_ADMIN, tenant_id=tenant_a, shop_id=uuid4())
    personal = user(UserRole.INDIVIDUAL, tenant_id=tenant_a)
    shop_row = listing(tenant_id=tenant_a, shop_id=owner.shop_id)
    personal_row = listing(tenant_id=tenant_a, posted_by_user_id=personal.id)

    assert can_manage_listing(shop_row, owner)
    assert can_manage_listing(personal_row, personal)
    assert can_manage_listing(listing(tenant_id=tenant_a), user(UserRole.COMMUNITY_ADMIN, tenant_id=tenant_a))
    assert not can_manage_listing(listing(tenant_id=tenant_a), user(UserRole.COMMUNITY_ADMIN, tenant_id=tenant_b))
    assert not can_manage_listing(listing(tenant_id=None), user(UserRole.COMMUNITY_ADMIN, tenant_id=None))
    assert can_manage_listing(listing(tenant_id=tenant_b), user(UserRole.SUPER_ADMIN, tenant_id=None))
    assert can_manage_listing(listing(tenant_id=tenant_b), user(UserRole.SUPER_ADMIN, tenant_id=tenant_a))
    assert not can_manage_listing(listing(tenant_id=tenant_a, shop_id=owner.shop_id, status=ListingStatus.DELETED), owner)


class Repo:
    def __init__(self, row):
        self.row = row
        self.updated = []

    async def get_by_id(self, _id):
        return self.row

    async def update(self, _id, data):
        self.updated.append(data)
        for key, value in data.items():
            setattr(self.row, key, value)
        return self.row


@pytest.mark.asyncio
async def test_update_delete_use_authorization_and_preserve_urgency():
    tenant_a, tenant_b = uuid4(), uuid4()
    row = listing(tenant_id=tenant_a)
    repo = Repo(row)
    service = ListingService(SimpleNamespace())
    service.listing_repo = repo

    with pytest.raises(ForbiddenError):
        await service.update_listing(row.id, ListingUpdate(title="Changed title"), user(UserRole.COMMUNITY_ADMIN, tenant_id=tenant_b))
    assert repo.updated == []
    unrelated = user(UserRole.INDIVIDUAL, tenant_id=tenant_a)
    with pytest.raises(ForbiddenError):
        await service.update_listing(row.id, ListingUpdate(title="No change"), unrelated)
    with pytest.raises(ForbiddenError):
        await service.delete_listing(row.id, unrelated)
    assert repo.updated == []

    await service.update_listing(row.id, ListingUpdate(title="Changed title"), user(UserRole.COMMUNITY_ADMIN, tenant_id=tenant_a))
    assert row.title == "Changed title"
    assert row.urgency == UrgencyLevel.URGENT

    with pytest.raises(ForbiddenError):
        await service.delete_listing(row.id, user(UserRole.COMMUNITY_ADMIN, tenant_id=tenant_b))
    assert row.status == ListingStatus.ACTIVE

    await service.delete_listing(row.id, user(UserRole.SUPER_ADMIN, tenant_id=None))
    assert row.status == ListingStatus.DELETED


@pytest.mark.asyncio
async def test_personal_owner_can_update_urgency_to_normal_and_read_back():
    owner = user(UserRole.INDIVIDUAL, tenant_id=uuid4())
    row = listing(tenant_id=owner.tenant_id, posted_by_user_id=owner.id)
    repo = Repo(row)
    service = ListingService(SimpleNamespace())
    service.listing_repo = repo
    await service.update_listing(row.id, ListingUpdate(urgency="normal"), owner)
    assert row.urgency == "normal"
    assert repo.updated[-1]["urgency"] == "normal"
    await service.delete_listing(row.id, owner)
    assert row.status == ListingStatus.DELETED


@pytest.mark.asyncio
async def test_fulfill_requires_active_owner():
    owner = user(UserRole.SHOP_ADMIN, shop_id=uuid4())
    row = listing(tenant_id=uuid4(), shop_id=owner.shop_id)
    service = ListingService(SimpleNamespace())
    service.listing_repo = Repo(row)
    assert can_fulfill_listing(row, owner)
    row.status = ListingStatus.FULFILLED
    assert not can_fulfill_listing(row, owner)
    with pytest.raises(ForbiddenError):
        await service.fulfill_listing(row.id, owner)


def test_detail_serialization_exposes_capabilities():
    tenant = uuid4()
    row = listing(tenant_id=tenant, posted_by_user_id=uuid4())
    row.shop = None
    row.posted_by = SimpleNamespace(id=row.posted_by_user_id, name="Poster", avatar_url=None)
    row.type = "offer"
    row.category = "volunteer"
    row.description = "A sufficiently long description"
    row.quantity = row.unit = row.expiry_date = None
    row.pricing_type = "free"
    row.price = row.price_max = row.price_unit = row.price_text = None
    row.is_free = True
    row.interest_count = 0
    row.images = []
    row.created_at = datetime.utcnow()
    data = _serialize_listing(row)
    assert data.id == str(row.id)
    assert "viewer_can_manage" in ListingDetailResponse.model_fields
    assert "viewer_can_fulfill" in ListingDetailResponse.model_fields
    assert can_manage_listing(row, user(UserRole.INDIVIDUAL, tenant_id=tenant, user_id=row.posted_by_user_id))


@pytest.mark.asyncio
async def test_detail_endpoint_returns_capabilities_for_each_viewer():
    tenant_a, tenant_b = uuid4(), uuid4()
    owner = user(UserRole.INDIVIDUAL, tenant_id=tenant_a)
    row = listing(tenant_id=tenant_a, posted_by_user_id=owner.id)
    row.shop = None
    row.posted_by = SimpleNamespace(id=owner.id, name="Poster", avatar_url=None)
    row.type, row.category, row.description = "offer", "volunteer", "A sufficiently long description"
    row.quantity = row.unit = row.expiry_date = None
    row.pricing_type, row.price, row.price_max = "free", None, None
    row.price_unit = row.price_text = None
    row.is_free, row.interest_count, row.images = True, 0, []
    row.created_at, row.views_count = datetime.utcnow(), 0

    class Service:
        async def get_listing(self, _id, _user): return row, False
    class Result:
        def scalar_one_or_none(self): return None
    class DB:
        async def execute(self, _statement): return Result()

    async def caps(viewer):
        return await get_listing(row.id, Service(), viewer, DB())

    assert (await caps(owner))["viewer_can_manage"] is True
    assert (await caps(user(UserRole.COMMUNITY_ADMIN, tenant_id=tenant_a)))["viewer_can_manage"] is True
    assert (await caps(user(UserRole.COMMUNITY_ADMIN, tenant_id=tenant_b)))["viewer_can_manage"] is False
    assert (await caps(None))["viewer_can_manage"] is False
    assert (await caps(owner))["viewer_can_fulfill"] is True
    assert (await caps(user(UserRole.COMMUNITY_ADMIN, tenant_id=tenant_a)))["viewer_can_fulfill"] is False
    assert (await caps(user(UserRole.SUPER_ADMIN)))["viewer_can_manage"] is True
    assert (await caps(user(UserRole.SUPER_ADMIN)))["viewer_can_fulfill"] is False


@pytest.mark.asyncio
async def test_mine_query_excludes_deleted_and_scopes_tenant():
    class Result:
        def scalars(self):
            return self
        def unique(self):
            return self
        def all(self):
            return []

    class DB:
        def __init__(self): self.statement = None
        async def execute(self, statement):
            self.statement = statement
            return Result()

    db = DB()
    owner = user(UserRole.INDIVIDUAL, tenant_id=uuid4())
    await my_listings(db=db, current_user=owner)
    compiled = db.statement.compile()
    sql = str(compiled)
    assert "listings.status !=" in sql
    assert "AND listings.tenant_id =" in sql
    assert "WHERE listings.posted_by_user_id =" in sql
    assert compiled.params["status_1"] == ListingStatus.DELETED
    assert compiled.params["tenant_id_1"] == owner.tenant_id
    assert compiled.params["posted_by_user_id_1"] == owner.id


@pytest.mark.asyncio
async def test_admin_remove_wires_tenant_and_rejects_foreign_listing():
    tenant_a, tenant_b = uuid4(), uuid4()

    class Service:
        def __init__(self): self.tenant_id = None; self.received = None
        async def remove_listing(self, listing_id, reason): self.received = (listing_id, reason, self.tenant_id)

    service = Service()
    admin = user(UserRole.COMMUNITY_ADMIN, tenant_id=tenant_a)
    listing_id = uuid4()
    await admin_remove_listing(listing_id, AdminListingDeleteRequest(reason="cleanup"), service, admin)
    assert service.received == (listing_id, "cleanup", tenant_a)

    service = Service()
    with pytest.raises(ForbiddenError):
        await admin_remove_listing(listing_id, AdminListingDeleteRequest(reason="cleanup"), service, user(UserRole.COMMUNITY_ADMIN, tenant_id=None))
    assert service.received is None
    for tenant in [None, tenant_b]:
        service = Service()
        await admin_remove_listing(listing_id, AdminListingDeleteRequest(reason="cleanup"), service, user(UserRole.SUPER_ADMIN, tenant_id=tenant))
        assert service.received == (listing_id, "cleanup", None)


@pytest.mark.asyncio
async def test_admin_service_remove_listing_filters_foreign_tenant():
    class DB:
        async def execute(self, statement):
            self.statement = statement
            return SimpleNamespace(scalar_one_or_none=lambda: None)

    db = DB()
    tenant_id, listing_id = uuid4(), uuid4()
    with pytest.raises(NotFoundError):
        await AdminService(db, tenant_id=tenant_id).remove_listing(listing_id, "cleanup")
    params = db.statement.compile().params
    assert "WHERE listings.id =" in str(db.statement)
    assert "AND listings.tenant_id =" in str(db.statement)
    assert params == {"id_1": listing_id, "tenant_id_1": tenant_id}
