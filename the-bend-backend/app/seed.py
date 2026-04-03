"""Seed script to create the initial community admin user."""
import asyncio
import sys
from uuid import uuid4

from app.database import async_session, engine, Base
from app.models.user import User
from app.models.enums import UserRole


async def create_community_admin(
    email: str = "admin@thebend.app",
    password: str = "admin123456",
    name: str = "Community Admin",
):
    """Create the initial community admin user."""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    async with async_session() as session:
        # Check if admin already exists
        from sqlalchemy import select
        result = await session.execute(
            select(User).where(User.email == email)
        )
        existing = result.scalar_one_or_none()
        if existing:
            print(f"Admin user already exists: {email}")
            return

        admin = User(
            id=uuid4(),
            email=email,
            password_hash=pwd_context.hash(password),
            name=name,
            role=UserRole.COMMUNITY_ADMIN,
            is_active=True,
        )
        session.add(admin)
        await session.commit()
        print(f"Community admin created: {email} / {password}")


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "admin@thebend.app"
    password = sys.argv[2] if len(sys.argv) > 2 else "admin123456"
    asyncio.run(create_community_admin(email, password))
