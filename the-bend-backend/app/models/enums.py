import enum


class ReferralStatus(str, enum.Enum):
    PENDING = "pending"
    CONTACTED = "contacted"
    DEMO_SCHEDULED = "demo_scheduled"
    LAUNCHED = "launched"
    EXPIRED = "expired"


class ReferralRewardType(str, enum.Enum):
    FREE_MONTHS = "free_months"
    CREDIT = "credit"
    REVSHARE = "revshare"


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    COMMUNITY_ADMIN = "community_admin"
    SHOP_ADMIN = "shop_admin"
    SHOP_EMPLOYEE = "shop_employee"
    INDIVIDUAL = "individual"


class ShopStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class ListingType(str, enum.Enum):
    OFFER = "offer"
    REQUEST = "request"


class ListingCategory(str, enum.Enum):
    STAFF = "staff"
    MATERIALS = "materials"
    EQUIPMENT = "equipment"
    VOLUNTEER = "volunteer"


class UrgencyLevel(str, enum.Enum):
    NORMAL = "normal"
    URGENT = "urgent"


class ListingStatus(str, enum.Enum):
    ACTIVE = "active"
    FULFILLED = "fulfilled"
    EXPIRED = "expired"
    DELETED = "deleted"


class PricingType(str, enum.Enum):
    FREE = "free"           # No charge
    FIXED = "fixed"         # Single price (existing behavior)
    HOURLY = "hourly"       # Rate per unit of time/work — needs price + unit
    RANGE = "range"         # Min-max range, e.g. $15-$25/hr — needs price + price_max + unit
    CUSTOM = "custom"       # Freeform text e.g. "DOE", "Negotiable"


class NotificationType(str, enum.Enum):
    REGISTRATION_SUBMITTED = "registration_submitted"
    EVENT_SUBMITTED = "event_submitted"
    REGISTRATION_APPROVED = "registration_approved"
    REGISTRATION_REJECTED = "registration_rejected"
    LISTING_INTEREST = "listing_interest"
    NEW_MESSAGE = "new_message"
    LISTING_EXPIRING = "listing_expiring"
    NEW_URGENT_LISTING = "new_urgent_listing"
    SHOP_SUSPENDED = "shop_suspended"
    LISTING_REPORTED = "listing_reported"
    BENDER_REPLY = "bender_reply"


class EventCategory(str, enum.Enum):
    COMMUNITY = "community"
    MUSIC = "music"
    ART = "art"
    FOOD = "food"
    MARKET = "market"
    HISTORIC = "historic"
    OUTDOOR = "outdoor"
    EDUCATION = "education"


class EventStatus(str, enum.Enum):
    ACTIVE = "active"
    PENDING = "pending"
    CANCELLED = "cancelled"
    PAST = "past"
    REJECTED = "rejected"


class ConnectorType(str, enum.Enum):
    ICS = "ics"
    RSS = "rss"
    HTML = "html"
