import Link from "next/link";

const LAST_UPDATED = "April 25, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="space-y-8">
          <header className="space-y-3">
            <p className="text-sm text-gray-500">
              <Link href="/" className="hover:underline">
                ← Home
              </Link>
            </p>

            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Privacy Policy
            </h1>

            <p className="text-sm text-gray-600">Last updated: {LAST_UPDATED}</p>
          </header>

          <section className="space-y-6 text-gray-700 leading-relaxed">
            <p>
              ReviewConcierge (&ldquo;ReviewConcierge&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) respects your privacy. This Privacy Policy explains what information we collect, how we use it, how we share it, and the choices you have. It applies to our services at <a className="underline" href="https://www.reviewconcierge.ai">reviewconcierge.ai</a> and our web application (the &ldquo;Service&rdquo;).
            </p>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Entity note:</span> ReviewConcierge is currently operated by Kyle McKay as a sole proprietorship based in California, USA. A California limited liability company is in formation and will replace this entity on publication of an updated policy.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Important:</span> ReviewConcierge generates reply drafts to help you respond faster and stay on-brand. <span className="font-medium text-gray-900">We do not post replies to Google on your behalf without your explicit approval.</span> We also do not use your data or your customers&rsquo; review data to train artificial intelligence models.
              </p>
            </div>

            <h2 className="text-xl font-semibold text-gray-900">1. Summary</h2>
            <p>
              ReviewConcierge helps hospitality businesses respond to Google reviews more efficiently by drafting owner-approved reply suggestions in the owner&rsquo;s configured voice, across six languages. To provide this service we process two categories of data: account data about you as our customer, and Google Business Profile data you authorize us to access on your behalf. We do not sell, rent, or transfer your data to third parties for their own marketing purposes. You can revoke our access and request deletion of your data at any time.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">2. Information we collect</h2>

            <h3 className="text-base font-semibold text-gray-900">2.1 Information you provide directly</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><span className="font-medium">Account information:</span> name, email address, password (hashed), business name, business location, business category, preferred language(s).</li>
              <li><span className="font-medium">Billing information:</span> processed by Stripe. We do not store full credit card numbers; we receive only a token and limited metadata (last four digits, card brand, expiration).</li>
              <li><span className="font-medium">Voice samples and preferences:</span> text samples you upload to train the drafting engine in your voice, configured preferences for tone and style.</li>
              <li><span className="font-medium">Communications:</span> emails and support messages you send us.</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-900">2.2 Information collected automatically</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><span className="font-medium">Usage data:</span> pages visited, features used, timestamps, approximate location derived from IP address.</li>
              <li><span className="font-medium">Device data:</span> browser type and version, operating system, device identifiers, screen resolution.</li>
              <li><span className="font-medium">Cookies and similar technologies:</span> session cookies for authentication, preference cookies for language and settings. We do not use advertising or cross-site tracking cookies.</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-900">2.3 Google Business Profile data (with your authorization)</h3>
            <p>
              When you connect your Google Business Profile to ReviewConcierge &mdash; either through Google OAuth or by granting us Manager access to your Google Business Profile &mdash; we access the following through the Google Business Profile APIs:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><span className="font-medium">Reviews:</span> review text, rating, reviewer name as displayed by Google, review timestamp, reviewer profile photo URL, reviewer language.</li>
              <li><span className="font-medium">Business location metadata:</span> business name, address, phone number, hours, categories, place ID.</li>
              <li><span className="font-medium">Your reply drafts and published replies:</span> the text of replies you approve and post through ReviewConcierge.</li>
              <li><span className="font-medium">Owner profile information:</span> your Google account email and basic profile metadata, used solely to verify the authorization.</li>
            </ul>
            <p>
              <span className="font-medium">We access this data only for locations you have explicitly authorized ReviewConcierge to manage.</span> We do not access data from any other Google Business Profile.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">3. How we use your information</h2>
            <p>
              We use the information we collect to provide the Service (drafting replies, displaying reviews, posting approved replies), bill you for subscriptions, communicate about the Service, improve the Service using aggregated and de-identified data, prevent fraud and security incidents, and comply with legal obligations.
            </p>

            <h3 className="text-base font-semibold text-gray-900">What we do NOT do with your data</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>We do not use Google Business Profile data, review content, voice samples, or any customer data to train artificial intelligence models. When we use AI services (including Anthropic&rsquo;s Claude) to generate draft replies, we send data to those services only for the purpose of generating a single draft, subject to contractual protections that prohibit training on that data.</li>
              <li>We do not sell or rent your personal information to third parties.</li>
              <li>We do not share your data with advertisers or data brokers.</li>
              <li>We do not use your data for any purpose not disclosed in this policy.</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">4. How we share your information</h2>
            <p>We share information only in the following limited circumstances:</p>

            <h3 className="text-base font-semibold text-gray-900">4.1 Sub-processors</h3>
            <p>
              We use the following service providers to operate ReviewConcierge. Each sub-processor is contractually bound to protect your data and may only process it on our behalf:
            </p>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-700">
                  <tr>
                    <th className="px-4 py-3 font-medium">Sub-processor</th>
                    <th className="px-4 py-3 font-medium">Purpose</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Privacy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-gray-700">
                  <tr>
                    <td className="px-4 py-3 font-medium text-gray-900">Anthropic, PBC</td>
                    <td className="px-4 py-3">AI drafting (Claude API)</td>
                    <td className="px-4 py-3">USA</td>
                    <td className="px-4 py-3"><a className="underline" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">Link</a></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-gray-900">Supabase, Inc.</td>
                    <td className="px-4 py-3">Database, authentication, storage</td>
                    <td className="px-4 py-3">USA</td>
                    <td className="px-4 py-3"><a className="underline" href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Link</a></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-gray-900">Stripe, Inc.</td>
                    <td className="px-4 py-3">Payment processing</td>
                    <td className="px-4 py-3">USA</td>
                    <td className="px-4 py-3"><a className="underline" href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Link</a></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-gray-900">Vercel Inc.</td>
                    <td className="px-4 py-3">Hosting, edge network, file storage</td>
                    <td className="px-4 py-3">USA</td>
                    <td className="px-4 py-3"><a className="underline" href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Link</a></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-gray-900">Google LLC</td>
                    <td className="px-4 py-3">Business Profile APIs, Workspace email</td>
                    <td className="px-4 py-3">USA</td>
                    <td className="px-4 py-3"><a className="underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Link</a></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-gray-900">Loom, Inc.</td>
                    <td className="px-4 py-3">Demo and onboarding video hosting</td>
                    <td className="px-4 py-3">USA</td>
                    <td className="px-4 py-3"><a className="underline" href="https://www.loom.com/privacy" target="_blank" rel="noopener noreferrer">Link</a></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-sm text-gray-600">
              We may update this list from time to time. Material changes will be communicated by email or through the Service.
            </p>

            <h3 className="text-base font-semibold text-gray-900">4.2 Legal disclosures</h3>
            <p>
              We may disclose personal information if required by law, subpoena, court order, or other governmental request, or if we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others, investigate fraud, or respond to a government request. We will notify you of such requests unless legally prohibited.
            </p>

            <h3 className="text-base font-semibold text-gray-900">4.3 Business transfers</h3>
            <p>
              If ReviewConcierge is involved in a merger, acquisition, financing, or sale of assets, personal information may be transferred as part of that transaction, subject to the acquiring party&rsquo;s agreement to honor the commitments in this policy.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">5. International data transfers</h2>
            <p>
              ReviewConcierge is based in the United States, and our sub-processors primarily store and process data in the United States. If you access the Service from outside the United States, your information will be transferred to, processed, and stored in the United States.
            </p>
            <p>
              For customers located in the European Economic Area, United Kingdom, or Switzerland, these transfers are governed by Standard Contractual Clauses (SCCs) approved by the European Commission, which we have in place with our sub-processors. For customers in other jurisdictions with cross-border transfer restrictions, we rely on legally valid transfer mechanisms applicable to your jurisdiction.
            </p>
            <p>
              If you require a copy of the applicable transfer mechanism for your contracts, contact <a className="underline" href="mailto:privacy@reviewconcierge.ai">privacy@reviewconcierge.ai</a>.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">6. Data retention</h2>
            <p>We retain personal information only as long as necessary:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><span className="font-medium">Account information:</span> while your account is active.</li>
              <li><span className="font-medium">Google Business Profile review data, draft replies, voice samples:</span> while your account is active, plus 30 days after cancellation.</li>
              <li><span className="font-medium">OAuth refresh tokens and Manager access tokens:</span> until revoked or 30 days after cancellation, whichever is sooner.</li>
              <li><span className="font-medium">Audit logs and security logs:</span> 90 days from creation.</li>
              <li><span className="font-medium">Billing records (invoices, payment history):</span> 7 years (US tax law requirement).</li>
              <li><span className="font-medium">Communications (support emails):</span> 2 years from last interaction.</li>
            </ul>
            <p>
              After the retention period, data is hard-deleted from primary systems. Backups are rotated on a 30-day cycle, so fully-deleted data may persist in backups for up to 30 additional days before being overwritten. If you explicitly request deletion under applicable law, we will delete your data within 30 days of verifying the request, except where we are legally required to retain specific records.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">7. Your rights</h2>
            <p>
              Depending on your jurisdiction, you may have rights to access, rectify, erase, restrict, port, or object to processing of your personal information, and to withdraw consent or lodge a complaint with a supervisory authority.
            </p>
            <p>
              To exercise these rights, email <a className="underline" href="mailto:privacy@reviewconcierge.ai">privacy@reviewconcierge.ai</a> with your name, account email, the right you wish to exercise, and sufficient information for us to verify your identity. We respond within 30 days. There is no charge except where requests are manifestly unfounded or excessive.
            </p>

            <h3 className="text-base font-semibold text-gray-900">7.1 California residents (CCPA / CPRA)</h3>
            <p>
              California residents have additional rights, including the right to know what personal information we collect, use, and disclose; to request deletion or correction; to opt out of sale or sharing (we do not sell or share personal information as defined under California law); to limit use of sensitive personal information; and to non-discrimination for exercising these rights.
            </p>

            <h3 className="text-base font-semibold text-gray-900">7.2 European Economic Area, United Kingdom, and Switzerland (GDPR / UK GDPR)</h3>
            <p>
              Customers in these jurisdictions have the rights listed above. Our lawful bases for processing are performance of contract, legitimate interest, legal obligation, and consent where applicable. You may lodge a complaint with your local data protection authority. EU/UK business customers may request a Data Processing Agreement (DPA) by emailing <a className="underline" href="mailto:dpo@reviewconcierge.ai">dpo@reviewconcierge.ai</a>.
            </p>

            <h3 className="text-base font-semibold text-gray-900">7.3 Australia, New Zealand, and South Africa</h3>
            <p>
              We handle personal information in accordance with the Australian Privacy Principles (Privacy Act 1988), the New Zealand Privacy Act 2020, and the South African Protection of Personal Information Act (POPIA). You may contact your local regulator with complaints.
            </p>

            <h3 className="text-base font-semibold text-gray-900">7.4 Revoking Google Business Profile access</h3>
            <p>You can revoke ReviewConcierge&rsquo;s access to your Google Business Profile at any time:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><span className="font-medium">If you connected via OAuth:</span> visit <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>, locate ReviewConcierge, and click <em>Remove access</em>.</li>
              <li><span className="font-medium">If you added ReviewConcierge as a Manager:</span> visit <a className="underline" href="https://business.google.com" target="_blank" rel="noopener noreferrer">business.google.com</a>, open your listing, navigate to <em>Settings &rarr; Managers</em>, and remove <span className="font-mono text-sm">kyle@reviewconcierge.ai</span>.</li>
            </ul>
            <p>Revocation is immediate. We will stop all data access within one hour and delete associated stored data within 30 days.</p>

            <h2 className="text-xl font-semibold text-gray-900">8. Security</h2>
            <p>
              We implement reasonable administrative, technical, and physical safeguards to protect personal information, including encryption of data in transit (TLS 1.2 or higher), encryption at rest (AES-256), row-level security in our database to isolate each organization&rsquo;s data, strict access controls, and regular review of security practices.
            </p>
            <p>
              No system is perfectly secure. If you become aware of a potential security issue, email <a className="underline" href="mailto:security@reviewconcierge.ai">security@reviewconcierge.ai</a>. In the event of a data breach affecting your personal information, we will notify affected customers without undue delay, and within 72 hours of becoming aware of the breach where required by applicable law.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">9. Children&rsquo;s privacy</h2>
            <p>
              ReviewConcierge is a business-to-business service intended for business owners and operators. We do not knowingly collect personal information from individuals under 16. If we learn we have collected data from a minor, we will delete it promptly.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">10. Google API Services User Data Policy</h2>
            <p>
              ReviewConcierge&rsquo;s use and transfer of information received from Google APIs to any other app adhere to the <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Specifically, we use Google user data only to provide or improve user-facing features of ReviewConcierge that are prominent in the requesting application&rsquo;s user experience; we do not transfer Google user data to others except as necessary to provide or improve user-facing features, comply with applicable law, or as part of a merger, acquisition, or sale of assets with user notice; we do not use Google user data for serving advertisements; we do not allow humans to read Google user data unless we have explicit consent, for security purposes, to comply with applicable law, or where the data is aggregated and anonymized; and we do not use Google user data to train AI or machine learning models.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">11. Contact</h2>
            <p>For privacy-related questions and requests:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><span className="font-medium">General privacy questions:</span> <a className="underline" href="mailto:privacy@reviewconcierge.ai">privacy@reviewconcierge.ai</a></li>
              <li><span className="font-medium">Data subject rights requests:</span> <a className="underline" href="mailto:privacy@reviewconcierge.ai">privacy@reviewconcierge.ai</a></li>
              <li><span className="font-medium">Security incidents:</span> <a className="underline" href="mailto:security@reviewconcierge.ai">security@reviewconcierge.ai</a></li>
              <li><span className="font-medium">Data Protection Officer (informal):</span> <a className="underline" href="mailto:dpo@reviewconcierge.ai">dpo@reviewconcierge.ai</a></li>
            </ul>
            <p>
              <span className="font-medium">Business address:</span><br />
              Kyle McKay<br />
              ReviewConcierge<br />
              2021 Fillmore Street, PMB #1105<br />
              San Francisco, CA 94115-2708<br />
              United States
            </p>

            <h2 className="text-xl font-semibold text-gray-900">12. Changes to this policy</h2>
            <p>
              We may update this policy from time to time. Material changes will be communicated by email to active customers at least 30 days before taking effect, and will be posted on this page with a revised &ldquo;Last updated&rdquo; date. Continued use of the Service after changes take effect constitutes acceptance of the updated policy.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}