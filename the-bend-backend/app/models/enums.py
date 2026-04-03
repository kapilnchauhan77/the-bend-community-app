import enum


class UserRole(str, enum.Enum):
    COMMUNITY_ADMIN = "community_admin"
    SHOP_ADMIN = "shop_admin"
    SHOP_EMPLOYEE = "shop_employee"


class ShopStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"


class ListingType(str, enum.Enum):
    OFFER = "offer"
    REQUEST = "request"


class ListingCategory(str, enum.Enum):
    STAFF = "staff"
    MATERIALS = "materials"
    EQUIPMENT = "equipment"


class UrgencyLevel(str, enum.Enum):
    NORMAL = "normal"
    URGENT = "urgent"
    CRITICAL = "critical"


class ListingStatus(str, enum.Enum):
    ACTIVE = "active"
    FULFILLED = "fulfilled"
    EXPIRED = "expired"
    DELETED = "deleted"


class NotificationType(str, enum.Enum):
    REGISTRATION_SUBMITTED = "registration_submitted"
    REGISTRATION_APPROVED = "registration_approved"
    REGISTRATION_REJECTED = "registration_rejected"
    LISTING_INTEREST = "listing_interest"
    NEW_MESSAGE = "new_message"
    LISTING_EXPIRING = "listing_expiring"
    NEW_CRITICAL_LISTING = "new_critical_listing"
    NEW_URGENT_LISTING = "new_urgent_listing"
    SHOP_SUSPENDED = "shop_suspended"
