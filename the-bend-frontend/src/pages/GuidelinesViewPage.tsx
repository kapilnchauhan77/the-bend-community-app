import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';

export default function GuidelinesViewPage() {
  const navigate = useNavigate();

  return (
    <PageLayout>
      {/* Page Header */}
      <section className="bg-[hsl(160,25%,24%)] py-8">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center gap-2 text-white/90 text-sm mb-1">
            <button onClick={() => navigate(-1)} className="hover:text-white transition-colors cursor-pointer" aria-label="Go back">
              <ArrowLeft size={14} />
            </button>
            <span>Home</span>
            <span>/</span>
            <span className="text-white">Community Guidelines</span>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-white">Community Guidelines</h1>
          <p className="text-sm text-white/85 mt-1">Rules and terms governing the Community Platform</p>
        </div>
      </section>

      <article className="max-w-3xl mx-auto px-4 md:px-8 py-10">
        <p className="text-xs text-[hsl(30,10%,55%)] mb-8 uppercase tracking-wider">Last updated: April 2026</p>

        {/* Section 1 */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">1. Purpose & Mission</h2>
          <p className="text-sm text-[hsl(30,10%,35%)] leading-relaxed mb-3">
            The Community Platform ("the Platform") is operated by ProLine Online Group ("the Operator") and serves as a resource-sharing hub connecting local businesses, volunteers, and talent in the community. Our mission is to reduce waste, strengthen local commerce, and foster neighborly cooperation through gig postings, materials, equipment, and services.
          </p>
        </section>

        {/* Section 2 */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">2. Membership & Eligibility</h2>
          <ul className="space-y-2 text-sm text-[hsl(30,10%,35%)] leading-relaxed list-disc list-inside">
            <li>All business registrations are subject to review and approval by the community administrator.</li>
            <li>Applicants must provide accurate and truthful business information during registration.</li>
            <li>Businesses must operate legally within their jurisdiction and hold any required licenses or permits.</li>
            <li>The community administrator reserves the right to deny or revoke membership at any time for violations of these guidelines.</li>
            <li>Each business may have one primary account. Duplicate registrations may be removed.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">3. Acceptable Use</h2>
          <p className="text-sm text-[hsl(30,10%,35%)] leading-relaxed mb-3">All members agree to:</p>
          <ul className="space-y-2 text-sm text-[hsl(30,10%,35%)] leading-relaxed list-disc list-inside">
            <li>Be honest and accurate in all listings — describe condition, quantity, and availability clearly.</li>
            <li>Respond to messages and inquiries promptly. A quick "no longer available" is better than silence.</li>
            <li>Honor commitments. If you agree to share something, follow through.</li>
            <li>Respect pricing norms. This platform is about community support, not profiteering.</li>
            <li>Treat all community members with respect and professionalism in all communications.</li>
            <li>Not post misleading, fraudulent, or illegal content.</li>
            <li>Not use the platform for spam, solicitation outside of legitimate listings, or harassment.</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">4. Listings & Transactions</h2>
          <ul className="space-y-2 text-sm text-[hsl(30,10%,35%)] leading-relaxed list-disc list-inside">
            <li>All listings must be for legitimate goods, services, gig postings, or equipment lending.</li>
            <li>Items listed as "free" must be provided at no cost. Items with a price must be honored at the listed price.</li>
            <li>Expired or fulfilled listings should be updated promptly to avoid confusion.</li>
            <li>The Platform does not facilitate payment between members for listings. All financial arrangements for shared resources are strictly between the participating parties.</li>
            <li>Members are responsible for verifying the quality, safety, and legality of any items or services exchanged.</li>
          </ul>
        </section>

        {/* Section 5 */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">5. Events & Community Features</h2>
          <ul className="space-y-2 text-sm text-[hsl(30,10%,35%)] leading-relaxed list-disc list-inside">
            <li>Community events listed on the Platform are sourced from public feeds, manual submissions, and third-party connectors. The Operator does not verify or guarantee the accuracy of event information.</li>
            <li>Volunteer and talent profiles are self-reported. The Platform does not verify credentials, skills, or availability.</li>
            <li>Booking inquiries through the Talent Marketplace are introductions only — all arrangements, payments, and agreements are between the parties involved.</li>
          </ul>
        </section>

        {/* Section 6 */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">6. Advertising & Sponsored Content</h2>
          <ul className="space-y-2 text-sm text-[hsl(30,10%,35%)] leading-relaxed list-disc list-inside">
            <li>Paid advertisements and sponsored placements are clearly labeled as "Community Partner" content.</li>
            <li>Advertisement pricing is set by the community administrator and is subject to change.</li>
            <li>All ad submissions are subject to review and approval. The Operator reserves the right to reject or remove any advertisement at its sole discretion.</li>
            <li>Advertising payments are non-refundable once the ad has been approved and published.</li>
            <li>Advertisers are responsible for the accuracy of their ad content and must not make false or misleading claims.</li>
          </ul>
        </section>

        {/* Section 7 — Liability */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">7. Limitation of Liability</h2>
          <div className="border border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] p-5 rounded text-sm text-[hsl(30,10%,35%)] leading-relaxed space-y-3">
            <p>
              <strong>THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND.</strong> ProLine Online Group, its officers, directors, employees, agents, and affiliates ("the Operator") shall not be held liable for:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Any transactions, payments, disputes, or agreements between members or between members and third parties.</li>
              <li>The quality, safety, legality, or accuracy of any listings, services, volunteer offers, talent profiles, or event information posted on the Platform.</li>
              <li>Any loss, damage, injury, or expense arising from the use of shared resources, equipment, materials, or gig arrangements through the Platform.</li>
              <li>Any financial loss resulting from advertising purchases, including but not limited to loss of revenue, business interruption, or failure to achieve expected results.</li>
              <li>Service interruptions, data loss, or technical failures of the Platform.</li>
              <li>Actions of third-party service providers, including but not limited to payment processors (Stripe), hosting providers, and data aggregation services.</li>
            </ul>
            <p>
              <strong>INDEMNIFICATION:</strong> By using the Platform, you agree to indemnify, defend, and hold harmless the Operator from any claims, liabilities, damages, losses, and expenses (including reasonable attorney fees) arising from your use of the Platform, your violation of these guidelines, or your violation of any rights of another party.
            </p>
            <p>
              <strong>PAYMENT DISCLAIMER:</strong> The Operator is not a party to any financial transaction between Platform members. All payments for shared resources, services, talent bookings, or other arrangements are conducted entirely between the involved parties. The Operator bears no responsibility for payment disputes, non-payment, refunds, or chargebacks between members.
            </p>
            <p>
              <strong>ADVERTISING PAYMENTS:</strong> Payments for advertising placements are processed by Stripe, a third-party payment processor. The Operator is not liable for payment processing errors, declined transactions, or disputes with the payment processor. Advertising fees are non-refundable once the ad is approved and live.
            </p>
          </div>
        </section>

        {/* Section 8 */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">8. Privacy & Data</h2>
          <ul className="space-y-2 text-sm text-[hsl(30,10%,35%)] leading-relaxed list-disc list-inside">
            <li>The Platform collects and stores only the information necessary to provide its services.</li>
            <li>Contact information shared in profiles, listings, and messages is visible to other authenticated members.</li>
            <li>Volunteer and talent contact information (phone numbers) is publicly visible by design to facilitate community connections.</li>
            <li>We do not sell or share personal data with third parties beyond what is necessary for Platform operation (e.g., payment processing via Stripe).</li>
            <li>Members may request deletion of their account and associated data by contacting the community administrator.</li>
          </ul>
        </section>

        {/* Section 9 */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">9. Content Moderation & Enforcement</h2>
          <ul className="space-y-2 text-sm text-[hsl(30,10%,35%)] leading-relaxed list-disc list-inside">
            <li>The community administrator may remove any content that violates these guidelines without prior notice.</li>
            <li>Accounts that repeatedly violate guidelines may be suspended or permanently banned.</li>
            <li>Members may report concerns or violations to the community administrator through the Platform's messaging system.</li>
            <li>Decisions regarding content removal, account suspension, or registration denial are at the sole discretion of the community administrator and the Operator.</li>
          </ul>
        </section>

        {/* Section 10 */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">10. Modifications</h2>
          <p className="text-sm text-[hsl(30,10%,35%)] leading-relaxed">
            The Operator reserves the right to modify these Community Guidelines at any time. Continued use of the Platform following any changes constitutes acceptance of the revised guidelines. Members will be notified of significant changes through the Platform.
          </p>
        </section>

        {/* Section 11 */}
        <section className="mb-10">
          <h2 className="font-serif text-xl font-bold text-[hsl(30,15%,18%)] mb-3">11. Contact</h2>
          <p className="text-sm text-[hsl(30,10%,35%)] leading-relaxed">
            For questions, concerns, or reports regarding these guidelines or the Platform, please contact the community administrator through the Platform's messaging system or email the Operator at <a href="mailto:support@proline-online.com" className="font-semibold hover:underline" style={{ color: 'hsl(35, 45%, 42%)' }}>support@proline-online.com</a>.
          </p>
        </section>

        {/* Footer note */}
        <div className="border-t border-[hsl(35,18%,84%)] pt-6 mt-10">
          <p className="text-xs text-[hsl(30,10%,55%)] leading-relaxed">
            &copy; 2026 The Community Platform. Operated by ProLine Online Group. All rights reserved.
          </p>
        </div>
      </article>
    </PageLayout>
  );
}
