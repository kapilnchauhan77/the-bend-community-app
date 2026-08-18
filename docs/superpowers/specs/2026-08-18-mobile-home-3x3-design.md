# Mobile Home 3x3 Menu Design

## Goal

Replace the six-card 2x3 mobile Home-page service menu with a branded, square 3x3 menu while preserving the current desktop service strip.

## Approved interaction

- The first two rows retain the existing destinations in their existing order: Gig Board, Materials, Equipment, Volunteer, Volunteer Opportunities, and Talent.
- The third row adds Events, Business Directory, and Bender.
- The Events tile previews the next three upcoming event titles already loaded by the Home page. Its preview advances every five seconds, while the tile always links to `/events`.
- The preview stays static when zero or one event is available and when the visitor requests reduced motion.
- Empty or failed event data shows a stable Events fallback rather than removing the destination.

## Responsive behavior

- Below the existing `md` breakpoint, render exactly nine touch targets in three columns and three rows inside a true square frame.
- At `md` and above, retain the existing six service cards and their current 3-column/tablet and 6-column/desktop layouts. Events, Directory, and Bender remain available through the existing desktop navigation.
- Validate the mobile composition at 320px, 390px, and 430px widths without horizontal overflow.

## Visual direction

- Preserve the incumbent parchment, warm-white, bronze, charcoal, serif, and fine-border visual language.
- Place a subtle, slightly offset antique-gold square outline behind the 3x3 frame to echo The Bend's square B mark. It is decorative and hidden from assistive technology.
- Mobile tiles use concise labels and omit the desktop descriptions so the nine destinations remain readable at 320px.
- Each tile is one semantic link with a minimum 44px touch area and a visible keyboard focus state.
- Motion is limited to a restrained event-title transition; the grid itself does not bounce or continuously animate.

## Non-goals

- Do not change desktop navigation, the desktop six-card service strip, event API contracts, sponsor-banner timing, or the lower Upcoming Events sections.
- Do not add an event-detail route or make the Events tile destination change while its preview rotates.
