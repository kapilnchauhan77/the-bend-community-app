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
        update_data = {k: v for k, v in data.items() if v is not None}
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
