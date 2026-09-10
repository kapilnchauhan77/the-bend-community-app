# Max: Make with BEND

Design for BEND-5. User approved the offering, confirmed the Gmail recipients, approved this written design, and authorized implementation on September 10, 2026. No deployment is claimed.

## Agreed offer

- D1. Add a permanent Max card to the advertising selection page. Display Custom pricing and a Make with BEND link to a dedicated `/make-with-bend` page. Preserve existing paid advertising packages and checkout behavior.
- D2. Permanent means the custom solution has no advertising expiry. Hosting, maintenance, support, third-party fees, and delivery scope are agreed separately in each quote. Do not promise unlimited lifetime service or automatic permanent sponsor placement.
- D3. Position the service as working with the creators of The Bend to build a customer's idea. Max is a consultative custom-build offer, not a fixed-price sponsor plan or a purchasable product in the duration-based catalog.
- D4. End the page with Tell us your idea. This opens Gmail compose with both `Jd.darr@proline-online.com` and `kapilnchauhan77@gmail.com` as recipients. The visitor writes and sends the message. The website does not send email or store an inquiry.

## Page and interaction

- U1. Use the existing Bend page layout and approved logo. The hero introduces Make with BEND and Custom pricing, followed by a clear explanation of the permanent offering.
- U2. Present six service examples: in-app restaurant reservations, marina or park live cameras, service-business price calculators, live gas-station pricing, newspaper feeds, and a video customer review creator. Label these as things we can build, not completed installations. Delivery depends on source access, hardware, vendor terms, and the agreed quote.
- U3. Follow with an image-led selected-work portfolio. Group the work by relevance to local businesses, with readable project names and concise descriptions of the team's verified contribution.
- U4. Explain the process as idea discussion, scoped proposal, build and review, then launch. Do not invent response times, delivery guarantees, customer counts, or performance statistics.
- U5. Place the final Tell us your idea link after the portfolio and process. Include a discreet Use another email app fallback with the same recipients. Opening compose must not show a Message sent or Inquiry received state.

## Portfolio sourcing

The user requested Bend, Provoke, Authentica, Taco, Aroma, Procys IV, Inperio AMIE, Arogya Health, and ACIL law. Past project records also identify MaxAssist, RecipeOps, and Fact Verification Agent as candidates, not yet approved published case studies.

- P1. Verify the correct project, current public URL when available, and actual contribution before writing each project description. Do not represent client products as owned by Bend or imply client endorsement.
- P2. Use real public screenshots or approved, sanitized demo images. Never include customer records, financial details, medical information, personal identifiers, credentials, or private internal URLs.
- P3. If a named project has no safe image or substantiated description, retain it in the content review inventory and report the gap. Do not invent screenshots, replace it with generic AI artwork presented as real work, or silently claim the complete requested portfolio is published.
- P4. Store approved optimized images with the frontend, supply descriptive alternative text and fixed dimensions, and lazy-load below-the-fold images. Avoid authenticated embeds, tracking widgets, and reliance on remote image hotlinks.

## Architecture

- A1. Implement one public React route and a page component using the existing PageLayout. The initial production destination is `https://westmoreland.bend.community/make-with-bend`, consistent with the current advertising flow. Add one navigation card to AdvertisePage without modifying its existing pricing, payment, or connector paths. Preserve the separate `bend.community` landing-page host branch. Adding Max to that root-domain branch or to global navigation is separate scope.
- A2. Keep service and portfolio content in a typed local data module. Separate rendered service concepts from verified portfolio projects. No database migration, Stripe product, sponsor activation, or admin pricing change is required.
- A3. Centralize the two recipients and compose-link construction. Use an HTTPS Gmail compose link with URL-encoded recipients and subject `Make with BEND: My idea`. Do not force a particular Gmail account or rely on a stored session. Gmail may require login.
- A4. Use an ordinary user-clicked link opening a new tab with `noopener noreferrer`. Provide a `mailto:` fallback using the same recipients and subject. No automatic draft creation during page load, email sending, or external request on hover.

## Verification and handoff

- T1. Verify the Max card opens the new route and that existing 30, 60, and 90-day package selection and checkout inputs remain unchanged.
- T2. Assert that Gmail and email fallback links decode to exactly both approved recipients and the chosen subject. Test the actual Gmail compose destination without sending a message. Distinguish URL tests, Gmail login redirects, and a verified populated compose window.
- T3. Check keyboard navigation, visible focus, accessible link names, image loading, readable copy, and no horizontal overflow at desktop and mobile widths. Check the active light and dark themes.
- T4. Confirm direct navigation to the route works in the production build. Run relevant frontend checks, build, review the combined diff, and verify the deployed route before posting release proof to BEND-5.
- T5. Jira proof must state what shipped, which portfolio entries were verified, image sources, test results, release identity, and remaining limitations. Keep BEND-5 in review for reporter acceptance only after the agreed page is delivered and verified.

## Scope exclusions

This release advertises custom services. It does not implement reservations, cameras, calculators, feeds, video generation, a CRM, automatic quote generation, or email delivery. No lifetime hosting price or fixed project fee is introduced.
