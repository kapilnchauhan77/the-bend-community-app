"""Privacy helpers — mask sensitive contact data for non-authenticated viewers."""
from __future__ import annotations


def mask_phone(value: str | None, viewer_authenticated: bool) -> str | None:
    """Return phone unchanged for authenticated viewers; partially masked otherwise.

    Examples:
        "+917984147792" → "+91••••••7792"
        "540-555-1000"  → "•••-•••-1000"
        "5405551000"    → "••••••1000"
        ""              → None
        None            → None
    """
    if viewer_authenticated:
        return value
    if not value:
        return None
    s = str(value).strip()
    # Keep last 4 actual digits visible; mask every other digit, keep separators.
    digits = [c for c in s if c.isdigit()]
    if len(digits) <= 4:
        return s  # too short to meaningfully mask
    keep_last = 4
    digit_idx = 0
    total_digits = len(digits)
    out = []
    for c in s:
        if c.isdigit():
            if digit_idx >= total_digits - keep_last:
                out.append(c)
            else:
                out.append('•')  # bullet
            digit_idx += 1
        else:
            out.append(c)
    return ''.join(out)


def mask_email(value: str | None, viewer_authenticated: bool) -> str | None:
    """Return email unchanged for authenticated viewers; partially masked otherwise.

    Examples:
        "jamie@example.com" → "j••••@example.com"
        "ab@x.io"           → "a•@x.io"
    """
    if viewer_authenticated:
        return value
    if not value or "@" not in value:
        return None
    local, _, domain = value.partition("@")
    if len(local) <= 1:
        masked_local = local + "•"
    else:
        masked_local = local[0] + "•" * max(1, min(4, len(local) - 1))
    return f"{masked_local}@{domain}"
