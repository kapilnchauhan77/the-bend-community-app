from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.repositories.shop_repo import ShopRepository
from app.models.shop import Shop
from app.models.employee import Employee
from app.models.user import User
from app.core.exceptions import NotFoundError, ForbiddenError


class ShopService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.shop_repo = ShopRepository(db)

    async def get_shop(self, shop_id: UUID) -> dict:
        result = await self.shop_repo.get_with_stats(shop_id)
        if not result:
            raise NotFoundError("Shop")
        return result

    async def update_shop(self, shop_id: UUID, data: dict, current_user: User):
        shop = await self.shop_repo.get_by_id(shop_id)
        if not shop:
            raise NotFoundError("Shop")
        if current_user.role.value != "community_admin" and shop.admin_user_id != current_user.id:
            raise ForbiddenError("Cannot modify another shop")

        # `regeocode` is a control flag, not a column. Capture it, then drop it so
        # it never reaches the repository write.
        regeocode = bool(data.pop("regeocode", False))

        # Whether the client explicitly supplied a manual pin. We check the raw
        # `data` (which is `model_dump(exclude_unset=True)`) for the *presence* of
        # both coordinate keys with real values — a manual pin always wins.
        manual_pin = (
            data.get("latitude") is not None and data.get("longitude") is not None
        )

        update_data = {k: v for k, v in data.items() if v is not None}
        from app.services.content_moderation_service import ContentModerationService
        ContentModerationService().validate_public_text({k: update_data.get(k) for k in ("name", "address", "business_type")})

        # Coordinate precedence:
        #   1. Manual pin present  -> use lat/lng verbatim, skip geocoding.
        #   2. regeocode == True   -> geocode the (new or existing) address,
        #                             overwriting lat/lng (None result clears them).
        #   3. address present and changed -> geocode as before.
        # All geocode calls are best-effort: never fail the update on error.
        if manual_pin:
            # Coordinates already in update_data; nothing else to do.
            pass
        elif regeocode:
            # Drop any stray coordinate keys so they don't shadow the geocode result.
            update_data.pop("latitude", None)
            update_data.pop("longitude", None)
            address_to_geocode = update_data.get("address", shop.address)
            try:
                from app.services.geocode_service import geocode_address
                coords = (
                    await geocode_address(address_to_geocode)
                    if address_to_geocode
                    else None
                )
                if coords:
                    update_data["latitude"], update_data["longitude"] = coords
                else:
                    update_data["latitude"] = None
                    update_data["longitude"] = None
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning(
                    "Re-geocoding shop %s on update failed: %s", shop_id, exc
                )
        else:
            new_address = update_data.get("address")
            if new_address is not None and new_address != shop.address:
                try:
                    from app.services.geocode_service import geocode_address
                    coords = await geocode_address(new_address)
                    if coords:
                        update_data["latitude"], update_data["longitude"] = coords
                    else:
                        update_data["latitude"] = None
                        update_data["longitude"] = None
                except Exception as exc:
                    import logging
                    logging.getLogger(__name__).warning(
                        "Geocoding shop %s on update failed: %s", shop_id, exc
                    )

        return await self.shop_repo.update(shop_id, update_data)

    async def get_employees(self, shop_id: UUID, current_user: User) -> list:
        self._check_shop_ownership(shop_id, current_user)
        result = await self.db.execute(
            select(Employee).where(Employee.shop_id == shop_id).order_by(Employee.name)
        )
        return list(result.scalars().all())

    async def add_employee(self, shop_id: UUID, data: dict, current_user: User):
        self._check_shop_ownership(shop_id, current_user)
        employee = Employee(id=uuid4(), shop_id=shop_id, **data)
        self.db.add(employee)
        await self.db.flush()
        await self.db.refresh(employee)
        return employee

    async def update_employee(self, shop_id: UUID, employee_id: UUID, data: dict, current_user: User):
        self._check_shop_ownership(shop_id, current_user)
        result = await self.db.execute(
            select(Employee).where(Employee.id == employee_id, Employee.shop_id == shop_id)
        )
        employee = result.scalar_one_or_none()
        if not employee:
            raise NotFoundError("Employee")
        for k, v in data.items():
            if v is not None and hasattr(employee, k):
                setattr(employee, k, v)
        await self.db.flush()
        await self.db.refresh(employee)
        return employee

    async def delete_employee(self, shop_id: UUID, employee_id: UUID, current_user: User):
        self._check_shop_ownership(shop_id, current_user)
        result = await self.db.execute(
            select(Employee).where(Employee.id == employee_id, Employee.shop_id == shop_id)
        )
        employee = result.scalar_one_or_none()
        if not employee:
            raise NotFoundError("Employee")
        await self.db.delete(employee)
        await self.db.flush()

    def _check_shop_ownership(self, shop_id: UUID, current_user: User):
        if current_user.role.value == "community_admin":
            return
        if current_user.shop_id != shop_id:
            raise ForbiddenError("Not authorized for this shop")
