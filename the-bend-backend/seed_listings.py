"""Seed script to create sample shops and listings."""
import asyncio
from uuid import uuid4
from datetime import datetime, timedelta

from passlib.context import CryptContext

from app.database import async_session
from app.models.user import User
from app.models.shop import Shop
from app.models.listing import Listing
from app.models.enums import (
    UserRole, ShopStatus, ListingType, ListingCategory,
    UrgencyLevel, ListingStatus,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def seed():
    async with async_session() as session:
        # --- Create shop admin users ---
        users = []
        user_data = [
            ("Sarah Mitchell", "sarah@surfside.com"),
            ("James Chen", "james@bendbrewery.com"),
            ("Maria Santos", "maria@coastalkitchen.com"),
            ("Tom Bradley", "tom@bendburgers.com"),
            ("Lucy Park", "lucy@seasidesweets.com"),
        ]
        for name, email in user_data:
            from sqlalchemy import select
            result = await session.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            if not user:
                user = User(
                    id=uuid4(), email=email,
                    password_hash=pwd_context.hash("pass123"),
                    name=name, role=UserRole.SHOP_ADMIN, is_active=True,
                )
                session.add(user)
            users.append(user)
        await session.flush()

        # --- Create shops ---
        shops = []
        shop_data = [
            ("Surfside Cafe", "cafe", "12 Beach Rd, The Bend", "0412345678"),
            ("Bend Brewery", "brewery", "45 Main St, The Bend", "0423456789"),
            ("Coastal Kitchen", "restaurant", "78 Ocean Dr, The Bend", "0434567890"),
            ("Bend Burgers", "fast_food", "23 High St, The Bend", "0445678901"),
            ("Seaside Sweets", "bakery", "9 Pier Ave, The Bend", "0456789012"),
        ]
        for i, (name, btype, addr, phone) in enumerate(shop_data):
            from sqlalchemy import select
            result = await session.execute(select(Shop).where(Shop.name == name))
            shop = result.scalar_one_or_none()
            if not shop:
                shop = Shop(
                    id=uuid4(), name=name, business_type=btype,
                    address=addr, contact_phone=phone,
                    status=ShopStatus.ACTIVE,
                    admin_user_id=users[i].id,
                    guidelines_accepted=True,
                    guidelines_accepted_at=datetime.utcnow(),
                )
                session.add(shop)
            shops.append(shop)

        await session.flush()

        # Link users to shops
        for i, user in enumerate(users):
            user.shop_id = shops[i].id

        await session.flush()

        # --- Create listings ---
        listings_data = [
            # Surfside Cafe
            (0, ListingType.OFFER, ListingCategory.STAFF, "Available: Experienced barista, Tue & Thu shifts",
             "Our barista is available for shifts on Tuesdays and Thursdays. 3 years experience with specialty coffee.",
             "2 shifts/week", "shifts", UrgencyLevel.NORMAL, True, None),
            (0, ListingType.OFFER, ListingCategory.MATERIALS, "Surplus Oat Milk - 20 Cartons",
             "We over-ordered oat milk. 20 cartons of Bonsoy Oat, expiring in 3 weeks. Free to a good home!",
             "20", "cartons", UrgencyLevel.URGENT, True, None),
            (0, ListingType.REQUEST, ListingCategory.EQUIPMENT, "Need Commercial Blender ASAP",
             "Our Vitamix broke mid-service. Looking to borrow or buy a commercial blender while ours is being repaired.",
             "1", "unit", UrgencyLevel.URGENT, False, 150.00),

            # Bend Brewery
            (1, ListingType.OFFER, ListingCategory.EQUIPMENT, "Spare Keg Fridge Available",
             "We have an extra keg fridge sitting in storage. Happy to lend it out for a few weeks if anyone needs one.",
             "1", "unit", UrgencyLevel.NORMAL, True, None),
            (1, ListingType.REQUEST, ListingCategory.STAFF, "Hiring: Weekend kitchen hand, Sat 6pm-11pm",
             "Looking for a kitchen hand for Saturday nights. Gets busy with live music events. 6pm-11pm.",
             "1", "person", UrgencyLevel.URGENT, False, 35.00),
            (1, ListingType.OFFER, ListingCategory.MATERIALS, "Leftover Hops - Cascade Variety",
             "We have about 5kg of Cascade hops from last season's brew. Still good quality, free for homebrewers or other breweries.",
             "5", "kg", UrgencyLevel.NORMAL, True, None),

            # Coastal Kitchen
            (2, ListingType.REQUEST, ListingCategory.MATERIALS, "Need Fresh Herbs - Bulk Order",
             "Our herb supplier is on holiday. Need basil, cilantro, and mint in bulk for the next 2 weeks.",
             "10", "kg", UrgencyLevel.URGENT, False, 80.00),
            (2, ListingType.OFFER, ListingCategory.STAFF, "Available: Head chef for private events, Mondays",
             "Our head chef is available for private catering events on Mondays (our day off). Fine dining experience.",
             "1", "person", UrgencyLevel.NORMAL, False, 500.00),
            (2, ListingType.OFFER, ListingCategory.MATERIALS, "Excess Salmon Fillets",
             "We received double our salmon order. 15kg of fresh Atlantic salmon, needs to be used within 3 days.",
             "15", "kg", UrgencyLevel.URGENT, False, 120.00),

            # Bend Burgers
            (3, ListingType.REQUEST, ListingCategory.EQUIPMENT, "Looking for Deep Fryer Rental",
             "Our second deep fryer is out for service. Need a commercial fryer for about 2 weeks.",
             "1", "unit", UrgencyLevel.URGENT, False, 200.00),
            (3, ListingType.OFFER, ListingCategory.MATERIALS, "Burger Buns - 200 Units",
             "Bakery delivered double our order. 200 sesame burger buns, baked fresh today. First come, first served!",
             "200", "units", UrgencyLevel.URGENT, True, None),
            (3, ListingType.OFFER, ListingCategory.STAFF, "Available: Grill cook, Mon-Wed afternoons",
             "Our grill cook has availability Mon-Wed afternoons if any venue needs experienced grill help.",
             "3", "shifts", UrgencyLevel.NORMAL, False, 30.00),

            # Seaside Sweets
            (4, ListingType.OFFER, ListingCategory.MATERIALS, "Belgian Chocolate - 10kg Blocks",
             "We switched suppliers and have 3 x 10kg blocks of Callebaut dark chocolate. Selling at cost.",
             "30", "kg", UrgencyLevel.NORMAL, False, 250.00),
            (4, ListingType.REQUEST, ListingCategory.EQUIPMENT, "Need Stand Mixer Urgently",
             "Our KitchenAid died right before a wedding cake order. Need a stand mixer for the next 48 hours!",
             "1", "unit", UrgencyLevel.URGENT, False, None),
            (4, ListingType.OFFER, ListingCategory.STAFF, "Available: Pastry decorator, Saturday mornings",
             "Our cake decorator has Saturday mornings free. Specializes in fondant work and sugar flowers.",
             "1", "person", UrgencyLevel.NORMAL, False, 45.00),
        ]

        from sqlalchemy import select
        result = await session.execute(select(Listing).limit(1))
        if result.scalar_one_or_none():
            print("Listings already exist, skipping seed.")
            await session.commit()
            return

        for shop_idx, ltype, cat, title, desc, qty, unit, urgency, is_free, price in listings_data:
            listing = Listing(
                id=uuid4(),
                shop_id=shops[shop_idx].id,
                type=ltype,
                category=cat,
                title=title,
                description=desc,
                quantity=qty,
                unit=unit,
                urgency=urgency,
                status=ListingStatus.ACTIVE,
                is_free=is_free,
                price=price,
                views_count=0,
                interest_count=0,
                expiry_date=datetime.utcnow() + timedelta(days=14),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            session.add(listing)

        await session.commit()
        print(f"Seeded 5 shops, 5 users, and {len(listings_data)} listings!")


if __name__ == "__main__":
    asyncio.run(seed())
