export const GUIDELINE_SECTIONS = [
  { id: 'purpose-mission', label: '1. Purpose & Mission' },
  { id: 'membership-eligibility', label: '2. Membership & Eligibility' },
  { id: 'acceptable-use', label: '3. Acceptable Use' },
  { id: 'listings-transactions', label: '4. Listings & Transactions' },
  { id: 'events-community-features', label: '5. Events & Community Features' },
  { id: 'advertising-sponsored-content', label: '6. Advertising & Sponsored Content' },
  { id: 'limitation-liability', label: '7. Limitation of Liability' },
  { id: 'privacy-data', label: '8. Privacy & Data' },
  { id: 'content-moderation-enforcement', label: '9. Content Moderation & Enforcement' },
  { id: 'modifications', label: '10. Modifications' },
  { id: 'contact', label: '11. Contact' },
] as const

export const GUIDELINE_SECTION_IDS: ReadonlySet<string> = new Set(
  GUIDELINE_SECTIONS.map(({ id }) => id),
)
