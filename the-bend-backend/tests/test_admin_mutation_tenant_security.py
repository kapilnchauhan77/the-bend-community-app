"""Tenant boundaries for community-admin reads, creates, and mutations."""

from __future__ import annotations

from uuid import UUID, uuid4

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select

from app.api.deps import get_db
from app.api.v1.admin import router as admin_router
from app.core.exceptions import AppException
from app.core.permissions import get_current_tenant, get_current_user
from app.database import async_session, engine
from app.models.ad_pricing import AdPricing
from app.models.enums import (
    ListingCategory,
    ListingStatus,
    ListingType,
    PricingType,
    ShopStatus,
    UrgencyLevel,
    UserRole,
)
from app.models.listing import Listing
from app.models.notification import Notification
from app.models.notification_outbox import NotificationOutbox
from app.models.shop import Shop
from app.models.sponsor import Sponsor
from app.models.success_story import SuccessStory
from app.models.tenant import Tenant
from app.models.user import User


def _admin_app(db, tenant: Tenant | None, user: User) -> FastAPI:
    tenant_id = tenant.id if tenant is not None else None
    user_id = user.id
    app = FastAPI()

    @app.exception_handler(AppException)
    async def app_exception_handler(_, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    app.include_router(admin_router, prefix="/api/v1")

    async def db_override():
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    async def tenant_override():
        return await db.get(Tenant, tenant_id) if tenant_id is not None else None

    async def user_override():
        return await db.get(User, user_id)

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_tenant] = tenant_override
    app.dependency_overrides[get_current_user] = user_override
    return app


async def _request(
    app: FastAPI,
    method: str,
    path: str,
    *,
    raise_app_exceptions: bool = True,
    **kwargs,
):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(
            app=app,
            raise_app_exceptions=raise_app_exceptions,
        ),
        base_url="http://test",
    ) as client:
        return await client.request(method, path, **kwargs)


def _listing(listing_id: UUID, tenant_id: UUID, title: str, **kwargs) -> Listing:
    return Listing(
        id=listing_id,
        tenant_id=tenant_id,
        type=ListingType.OFFER,
        category=ListingCategory.MATERIALS,
        title=title,
        description="Tenant-bound listing",
        pricing_type=PricingType.FREE,
        is_free=True,
        urgency=UrgencyLevel.NORMAL,
        status=ListingStatus.ACTIVE,
        **kwargs,
    )


@pytest_asyncio.fixture
async def admin_mutation_rows():
    await engine.dispose()
    names = (
        "tenant_a",
        "tenant_b",
        "admin_a",
        "admin_b",
        "super_admin",
        "owner_a",
        "owner_b",
        "approve_a",
        "reject_a",
        "suspend_a",
        "reactivate_a",
        "approve_b",
        "reject_b",
        "suspend_b",
        "reactivate_b",
        "individual_suspend_a",
        "individual_reactivate_a",
        "individual_suspend_b",
        "individual_reactivate_b",
        "listing_a",
        "listing_b",
        "shop_listing_a",
        "shop_listing_b",
        "story_listing_a",
        "story_listing_b",
        "sponsor_update_a",
        "sponsor_delete_a",
        "sponsor_approve_a",
        "sponsor_update_b",
        "sponsor_delete_b",
        "sponsor_approve_b",
        "pricing_update_a",
        "pricing_delete_a",
        "pricing_update_b",
        "pricing_delete_b",
        "story_a",
        "story_b",
    )
    ids = {name: uuid4() for name in names}
    marker = uuid4().hex

    async with async_session() as db:
        db.add_all(
            [
                Tenant(
                    id=ids["tenant_a"],
                    slug=f"admin-a-{marker}",
                    subdomain=f"admin-a-{marker}",
                    display_name="Admin tenant A",
                ),
                Tenant(
                    id=ids["tenant_b"],
                    slug=f"admin-b-{marker}",
                    subdomain=f"admin-b-{marker}",
                    display_name="Admin tenant B",
                ),
            ]
        )
        await db.flush()
        db.add_all(
            [
                User(
                    id=ids["admin_a"],
                    tenant_id=ids["tenant_a"],
                    email=f"admin-a-{marker}@example.test",
                    password_hash="x",
                    name="Tenant A admin",
                    role=UserRole.COMMUNITY_ADMIN,
                ),
                User(
                    id=ids["admin_b"],
                    tenant_id=ids["tenant_b"],
                    email=f"admin-b-{marker}@example.test",
                    password_hash="x",
                    name="Tenant B admin",
                    role=UserRole.COMMUNITY_ADMIN,
                ),
                User(
                    id=ids["super_admin"],
                    tenant_id=None,
                    email=f"super-admin-{marker}@example.test",
                    password_hash="x",
                    name="Platform admin",
                    role=UserRole.SUPER_ADMIN,
                ),
                User(
                    id=ids["owner_a"],
                    tenant_id=ids["tenant_a"],
                    email=f"owner-a-{marker}@example.test",
                    password_hash="x",
                    name="Tenant A owner",
                    role=UserRole.SHOP_ADMIN,
                ),
                User(
                    id=ids["owner_b"],
                    tenant_id=ids["tenant_b"],
                    email=f"owner-b-{marker}@example.test",
                    password_hash="x",
                    name="Tenant B owner",
                    role=UserRole.SHOP_ADMIN,
                ),
                User(
                    id=ids["individual_suspend_a"],
                    tenant_id=ids["tenant_a"],
                    email=f"individual-sa-{marker}@example.test",
                    password_hash="x",
                    name="Tenant A active individual",
                    role=UserRole.INDIVIDUAL,
                    is_active=True,
                ),
                User(
                    id=ids["individual_reactivate_a"],
                    tenant_id=ids["tenant_a"],
                    email=f"individual-ra-{marker}@example.test",
                    password_hash="x",
                    name="Tenant A inactive individual",
                    role=UserRole.INDIVIDUAL,
                    is_active=False,
                ),
                User(
                    id=ids["individual_suspend_b"],
                    tenant_id=ids["tenant_b"],
                    email=f"individual-sb-{marker}@example.test",
                    password_hash="x",
                    name="Tenant B active individual",
                    role=UserRole.INDIVIDUAL,
                    is_active=True,
                ),
                User(
                    id=ids["individual_reactivate_b"],
                    tenant_id=ids["tenant_b"],
                    email=f"individual-rb-{marker}@example.test",
                    password_hash="x",
                    name="Tenant B inactive individual",
                    role=UserRole.INDIVIDUAL,
                    is_active=False,
                ),
            ]
        )
        await db.flush()

        shop_rows = []
        for tenant_key, owner_key, suffix in (
            ("tenant_a", "owner_a", "a"),
            ("tenant_b", "owner_b", "b"),
        ):
            tenant_id = ids[tenant_key]
            owner_id = ids[owner_key]
            shop_rows.extend(
                [
                    Shop(
                        id=ids[f"approve_{suffix}"],
                        tenant_id=tenant_id,
                        admin_user_id=owner_id,
                        name=f"Approve {suffix}",
                        business_type="services",
                        status=ShopStatus.PENDING,
                    ),
                    Shop(
                        id=ids[f"reject_{suffix}"],
                        tenant_id=tenant_id,
                        admin_user_id=owner_id,
                        name=f"Reject {suffix}",
                        business_type="services",
                        status=ShopStatus.PENDING,
                    ),
                    Shop(
                        id=ids[f"suspend_{suffix}"],
                        tenant_id=tenant_id,
                        admin_user_id=owner_id,
                        name=f"Suspend {suffix}",
                        business_type="services",
                        status=ShopStatus.ACTIVE,
                    ),
                    Shop(
                        id=ids[f"reactivate_{suffix}"],
                        tenant_id=tenant_id,
                        admin_user_id=owner_id,
                        name=f"Reactivate {suffix}",
                        business_type="services",
                        status=ShopStatus.SUSPENDED,
                    ),
                ]
            )
        db.add_all(shop_rows)
        await db.flush()

        db.add_all(
            [
                _listing(ids["listing_a"], ids["tenant_a"], "Listing A"),
                _listing(ids["listing_b"], ids["tenant_b"], "Listing B"),
                _listing(
                    ids["shop_listing_a"],
                    ids["tenant_a"],
                    "Shop listing A",
                    shop_id=ids["suspend_a"],
                ),
                _listing(
                    ids["shop_listing_b"],
                    ids["tenant_b"],
                    "Shop listing B",
                    shop_id=ids["suspend_b"],
                ),
                _listing(
                    ids["story_listing_a"], ids["tenant_a"], "Story listing A"
                ),
                _listing(
                    ids["story_listing_b"], ids["tenant_b"], "Story listing B"
                ),
            ]
        )
        await db.flush()

        db.add_all(
            [
                Sponsor(
                    id=ids[f"sponsor_{action}_{suffix}"],
                    tenant_id=ids[f"tenant_{suffix}"],
                    name=f"Sponsor {action} {suffix}",
                    placement="homepage",
                    is_active=False,
                )
                for suffix in ("a", "b")
                for action in ("update", "delete", "approve")
            ]
            + [
                AdPricing(
                    id=ids[f"pricing_{action}_{suffix}"],
                    tenant_id=ids[f"tenant_{suffix}"],
                    name=f"Pricing {action} {suffix}",
                    placement="homepage",
                    duration_days=30,
                    price_cents=1000,
                )
                for suffix in ("a", "b")
                for action in ("update", "delete")
            ]
            + [
                SuccessStory(
                    id=ids[f"story_{suffix}"],
                    tenant_id=ids[f"tenant_{suffix}"],
                    listing_id=ids[f"story_listing_{suffix}"],
                    author_name=f"Story {suffix}",
                    quote="Tenant-bound story",
                    is_featured=False,
                )
                for suffix in ("a", "b")
            ]
        )
        await db.commit()

    try:
        yield ids
    finally:
        tenant_ids = [ids["tenant_a"], ids["tenant_b"]]
        async with async_session() as db:
            await db.execute(
                delete(NotificationOutbox).where(
                    NotificationOutbox.tenant_id.in_(tenant_ids)
                )
            )
            await db.execute(
                delete(Notification).where(Notification.tenant_id.in_(tenant_ids))
            )
            await db.execute(
                delete(SuccessStory).where(SuccessStory.tenant_id.in_(tenant_ids))
            )
            await db.execute(delete(Sponsor).where(Sponsor.tenant_id.in_(tenant_ids)))
            await db.execute(
                delete(AdPricing).where(AdPricing.tenant_id.in_(tenant_ids))
            )
            await db.execute(delete(Listing).where(Listing.tenant_id.in_(tenant_ids)))
            await db.execute(delete(Shop).where(Shop.tenant_id.in_(tenant_ids)))
            await db.execute(delete(User).where(User.tenant_id.in_(tenant_ids)))
            await db.execute(delete(User).where(User.id == ids["super_admin"]))
            await db.execute(delete(Tenant).where(Tenant.id.in_(tenant_ids)))
            await db.commit()
        await engine.dispose()


def _collection_requests():
    return [
        ("GET", "/api/v1/admin/dashboard", None),
        ("GET", "/api/v1/admin/registrations", None),
        ("GET", "/api/v1/admin/shops", None),
        ("GET", "/api/v1/admin/individuals", None),
        ("GET", "/api/v1/admin/listings", None),
        ("GET", "/api/v1/admin/reports", None),
        ("GET", "/api/v1/admin/sponsors", None),
        (
            "POST",
            "/api/v1/admin/sponsors",
            {"name": "Must not be created", "placement": "homepage"},
        ),
        ("GET", "/api/v1/admin/pricing", None),
        (
            "POST",
            "/api/v1/admin/pricing",
            {
                "name": "Must not be created",
                "placement": "homepage",
                "duration_days": 30,
                "price_cents": 2500,
            },
        ),
        ("GET", "/api/v1/admin/reports/flags", None),
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("tenant_mode", ["unresolved", "mismatched"])
async def test_every_tenant_admin_collection_requires_matching_request_tenant(
    admin_mutation_rows, tenant_mode
):
    ids = admin_mutation_rows
    async with async_session() as db:
        admin_a = await db.get(User, ids["admin_a"])
        tenant = (
            None
            if tenant_mode == "unresolved"
            else await db.get(Tenant, ids["tenant_b"])
        )
        app = _admin_app(db, tenant, admin_a)
        sponsor_count = (
            await db.execute(
                select(func.count()).select_from(Sponsor).where(
                    Sponsor.tenant_id == ids["tenant_a"]
                )
            )
        ).scalar_one()
        pricing_count = (
            await db.execute(
                select(func.count()).select_from(AdPricing).where(
                    AdPricing.tenant_id == ids["tenant_a"]
                )
            )
        ).scalar_one()

        responses = [
            await _request(app, method, path, json=payload)
            for method, path, payload in _collection_requests()
        ]

        assert [response.status_code for response in responses] == [404] * len(
            responses
        )
        assert (
            await db.execute(
                select(func.count()).select_from(Sponsor).where(
                    Sponsor.tenant_id == ids["tenant_a"]
                )
            )
        ).scalar_one() == sponsor_count
        assert (
            await db.execute(
                select(func.count()).select_from(AdPricing).where(
                    AdPricing.tenant_id == ids["tenant_a"]
                )
            )
        ).scalar_one() == pricing_count


def _cross_tenant_mutations(ids: dict[str, UUID]):
    return [
        (
            "POST",
            f"/api/v1/admin/registrations/{ids['approve_a']}/approve",
            None,
        ),
        (
            "POST",
            f"/api/v1/admin/registrations/{ids['reject_a']}/reject",
            {"reason": "No"},
        ),
        (
            "POST",
            f"/api/v1/admin/shops/{ids['suspend_a']}/suspend",
            {"reason": "No"},
        ),
        (
            "POST",
            f"/api/v1/admin/shops/{ids['reactivate_a']}/reactivate",
            None,
        ),
        (
            "POST",
            f"/api/v1/admin/individuals/{ids['individual_suspend_a']}/suspend",
            {"reason": "No"},
        ),
        (
            "POST",
            f"/api/v1/admin/individuals/{ids['individual_reactivate_a']}/reactivate",
            None,
        ),
        (
            "DELETE",
            f"/api/v1/admin/listings/{ids['listing_a']}",
            {"reason": "No"},
        ),
        (
            "PUT",
            f"/api/v1/admin/sponsors/{ids['sponsor_update_a']}",
            {"name": "Cross-tenant update"},
        ),
        (
            "DELETE",
            f"/api/v1/admin/sponsors/{ids['sponsor_delete_a']}",
            None,
        ),
        (
            "POST",
            f"/api/v1/admin/sponsors/{ids['sponsor_approve_a']}/approve",
            None,
        ),
        (
            "PUT",
            f"/api/v1/admin/pricing/{ids['pricing_update_a']}",
            {"name": "Cross-tenant update"},
        ),
        (
            "DELETE",
            f"/api/v1/admin/pricing/{ids['pricing_delete_a']}",
            None,
        ),
        (
            "POST",
            f"/api/v1/admin/stories/{ids['story_a']}/feature",
            None,
        ),
    ]


@pytest.mark.asyncio
async def test_tenant_admin_cannot_mutate_another_tenants_admin_targets(
    admin_mutation_rows,
):
    ids = admin_mutation_rows
    async with async_session() as db:
        tenant_b = await db.get(Tenant, ids["tenant_b"])
        admin_b = await db.get(User, ids["admin_b"])
        app = _admin_app(db, tenant_b, admin_b)

        responses = [
            await _request(app, method, path, json=payload)
            for method, path, payload in _cross_tenant_mutations(ids)
        ]

        assert [response.status_code for response in responses] == [404] * len(
            responses
        )
        assert (await db.get(Shop, ids["approve_a"])).status == ShopStatus.PENDING
        assert (await db.get(Shop, ids["reject_a"])).rejection_reason is None
        assert (await db.get(Shop, ids["suspend_a"])).status == ShopStatus.ACTIVE
        assert (
            await db.get(Listing, ids["shop_listing_a"])
        ).status == ListingStatus.ACTIVE
        assert (
            await db.get(Shop, ids["reactivate_a"])
        ).status == ShopStatus.SUSPENDED
        assert (await db.get(User, ids["individual_suspend_a"])).is_active is True
        assert (
            await db.get(User, ids["individual_reactivate_a"])
        ).is_active is False
        assert (await db.get(Listing, ids["listing_a"])).status == ListingStatus.ACTIVE
        assert (await db.get(Sponsor, ids["sponsor_update_a"])).name == "Sponsor update a"
        assert await db.get(Sponsor, ids["sponsor_delete_a"]) is not None
        assert (await db.get(Sponsor, ids["sponsor_approve_a"])).approved is False
        assert (await db.get(AdPricing, ids["pricing_update_a"])).name == "Pricing update a"
        assert await db.get(AdPricing, ids["pricing_delete_a"]) is not None
        assert (await db.get(SuccessStory, ids["story_a"])).is_featured is False


@pytest.mark.asyncio
async def test_matching_tenant_admin_operations_remain_scoped_and_functional(
    admin_mutation_rows,
):
    ids = admin_mutation_rows
    async with async_session() as db:
        tenant_b = await db.get(Tenant, ids["tenant_b"])
        admin_b = await db.get(User, ids["admin_b"])
        app = _admin_app(db, tenant_b, admin_b)

        sponsors = await _request(app, "GET", "/api/v1/admin/sponsors")
        pricing = await _request(app, "GET", "/api/v1/admin/pricing")
        assert sponsors.status_code == pricing.status_code == 200
        assert {item["id"] for item in sponsors.json()["items"]} == {
            str(ids["sponsor_update_b"]),
            str(ids["sponsor_delete_b"]),
            str(ids["sponsor_approve_b"]),
        }
        assert {item["id"] for item in pricing.json()["items"]} == {
            str(ids["pricing_update_b"]),
            str(ids["pricing_delete_b"]),
        }

        created_sponsor = await _request(
            app,
            "POST",
            "/api/v1/admin/sponsors",
            json={"name": "Created sponsor B", "placement": "homepage"},
        )
        created_pricing = await _request(
            app,
            "POST",
            "/api/v1/admin/pricing",
            json={
                "name": "Created pricing B",
                "placement": "homepage",
                "duration_days": 30,
                "price_cents": 2500,
            },
        )
        assert created_sponsor.status_code == created_pricing.status_code == 200

        requests = [
            (
                "POST",
                f"/api/v1/admin/registrations/{ids['approve_b']}/approve",
                None,
            ),
            (
                "POST",
                f"/api/v1/admin/registrations/{ids['reject_b']}/reject",
                {"reason": "Incomplete"},
            ),
            (
                "POST",
                f"/api/v1/admin/shops/{ids['suspend_b']}/suspend",
                {"reason": "Policy"},
            ),
            (
                "POST",
                f"/api/v1/admin/shops/{ids['reactivate_b']}/reactivate",
                None,
            ),
            (
                "POST",
                f"/api/v1/admin/individuals/{ids['individual_suspend_b']}/suspend",
                {"reason": "Policy"},
            ),
            (
                "POST",
                f"/api/v1/admin/individuals/{ids['individual_reactivate_b']}/reactivate",
                None,
            ),
            (
                "DELETE",
                f"/api/v1/admin/listings/{ids['listing_b']}",
                {"reason": "Policy"},
            ),
            (
                "PUT",
                f"/api/v1/admin/sponsors/{ids['sponsor_update_b']}",
                {"name": "Updated sponsor B"},
            ),
            (
                "DELETE",
                f"/api/v1/admin/sponsors/{ids['sponsor_delete_b']}",
                None,
            ),
            (
                "POST",
                f"/api/v1/admin/sponsors/{ids['sponsor_approve_b']}/approve",
                None,
            ),
            (
                "PUT",
                f"/api/v1/admin/pricing/{ids['pricing_update_b']}",
                {"name": "Updated pricing B"},
            ),
            (
                "DELETE",
                f"/api/v1/admin/pricing/{ids['pricing_delete_b']}",
                None,
            ),
            (
                "POST",
                f"/api/v1/admin/stories/{ids['story_b']}/feature",
                None,
            ),
        ]
        responses = [
            await _request(app, method, path, json=payload)
            for method, path, payload in requests
        ]

        assert [response.status_code for response in responses] == [200] * len(
            responses
        )
        assert (
            await db.get(Sponsor, UUID(created_sponsor.json()["id"]))
        ).tenant_id == ids["tenant_b"]
        assert (
            await db.get(AdPricing, UUID(created_pricing.json()["id"]))
        ).tenant_id == ids["tenant_b"]
        assert (await db.get(Shop, ids["approve_b"])).status == ShopStatus.ACTIVE
        assert (await db.get(Shop, ids["reject_b"])).rejection_reason == "Incomplete"
        assert (await db.get(Shop, ids["suspend_b"])).status == ShopStatus.SUSPENDED
        assert (
            await db.get(Listing, ids["shop_listing_b"])
        ).status == ListingStatus.DELETED
        assert (await db.get(Shop, ids["reactivate_b"])).status == ShopStatus.ACTIVE
        assert (await db.get(User, ids["individual_suspend_b"])).is_active is False
        assert (
            await db.get(User, ids["individual_reactivate_b"])
        ).is_active is True
        assert (await db.get(Listing, ids["listing_b"])).status == ListingStatus.DELETED
        assert (await db.get(Sponsor, ids["sponsor_update_b"])).name == "Updated sponsor B"
        assert await db.get(Sponsor, ids["sponsor_delete_b"]) is None
        assert (await db.get(Sponsor, ids["sponsor_approve_b"])).approved is True
        assert (await db.get(Sponsor, ids["sponsor_approve_b"])).is_active is True
        assert (await db.get(AdPricing, ids["pricing_update_b"])).name == "Updated pricing B"
        assert await db.get(AdPricing, ids["pricing_delete_b"]) is None
        assert (await db.get(SuccessStory, ids["story_b"])).is_featured is True


@pytest.mark.asyncio
async def test_platform_admin_requires_a_resolved_tenant_and_stays_scoped_to_it(
    admin_mutation_rows,
):
    ids = admin_mutation_rows
    async with async_session() as db:
        super_admin = await db.get(User, ids["super_admin"])
        tenant_b = await db.get(Tenant, ids["tenant_b"])
        resolved_app = _admin_app(db, tenant_b, super_admin)
        unresolved_app = _admin_app(db, None, super_admin)

        unresolved = await _request(
            unresolved_app, "GET", "/api/v1/admin/sponsors"
        )
        listed = await _request(resolved_app, "GET", "/api/v1/admin/sponsors")
        updated = await _request(
            resolved_app,
            "PUT",
            f"/api/v1/admin/sponsors/{ids['sponsor_update_b']}",
            json={"name": "Platform-scoped update"},
        )
        foreign = await _request(
            resolved_app,
            "PUT",
            f"/api/v1/admin/sponsors/{ids['sponsor_update_a']}",
            json={"name": "Must not change"},
        )

        assert unresolved.status_code == 404
        assert listed.status_code == updated.status_code == 200
        assert foreign.status_code == 404
        assert {item["id"] for item in listed.json()["items"]} == {
            str(ids["sponsor_update_b"]),
            str(ids["sponsor_delete_b"]),
            str(ids["sponsor_approve_b"]),
        }
        assert (
            await db.get(Sponsor, ids["sponsor_update_b"])
        ).name == "Platform-scoped update"
        assert (
            await db.get(Sponsor, ids["sponsor_update_a"])
        ).name == "Sponsor update a"


@pytest.mark.asyncio
async def test_pricing_update_cannot_reassign_the_rows_tenant(admin_mutation_rows):
    ids = admin_mutation_rows
    async with async_session() as db:
        tenant_b = await db.get(Tenant, ids["tenant_b"])
        admin_b = await db.get(User, ids["admin_b"])
        app = _admin_app(db, tenant_b, admin_b)

        response = await _request(
            app,
            "PUT",
            f"/api/v1/admin/pricing/{ids['pricing_update_b']}",
            json={
                "name": "Safe pricing update",
                "tenant_id": str(ids["tenant_a"]),
            },
            raise_app_exceptions=False,
        )

        assert response.status_code == 200
        pricing = await db.get(AdPricing, ids["pricing_update_b"])
        assert pricing.name == "Safe pricing update"
        assert pricing.tenant_id == ids["tenant_b"]
