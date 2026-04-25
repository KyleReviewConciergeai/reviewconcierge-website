import Link from "next/link";

const LAST_UPDATED = "April 25, 2026";

export default function TermsPage() {
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
              Terms of Service
            </h1>

            <p className="text-sm text-gray-600">Last updated: {LAST_UPDATED}</p>
          </header>

          <section className="space-y-6 text-gray-700 leading-relaxed">
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the services provided at <a className="underline" href="https://www.reviewconcierge.ai">reviewconcierge.ai</a> and our web application (together, the &ldquo;Service&rdquo;), provided by ReviewConcierge (&ldquo;ReviewConcierge&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;).
            </p>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Entity note:</span> ReviewConcierge is currently operated by Kyle McKay as a sole proprietorship based in California, USA. A California limited liability company is in formation and will succeed to these Terms upon a published update.
              </p>
            </div>

            <p>
              By accessing or using the Service, you agree to these Terms. If you are using the Service on behalf of a business or other entity, you represent that you have authority to bind that entity to these Terms. If you do not agree to these Terms, do not use the Service.
            </p>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Important:</span> The Service generates suggested reply drafts. You are responsible for reviewing and deciding whether to use or publish any content. <span className="font-medium text-gray-900">We do not post replies to Google on your behalf without your explicit approval.</span>
              </p>
            </div>

            <h2 className="text-xl font-semibold text-gray-900">1. What ReviewConcierge does</h2>
            <p>
              ReviewConcierge is a software-as-a-service tool that helps hospitality businesses respond to their Google reviews. The Service drafts reply suggestions in your configured voice and in the reviewer&rsquo;s language, which you review and approve in the dashboard before they are posted to Google on your behalf. Every reply that reaches Google is reviewed and approved by you or someone you authorize within your organization.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">2. Your account</h2>
            <h3 className="text-base font-semibold text-gray-900">2.1 Eligibility</h3>
            <p>
              You must be at least 18 years old and have legal capacity to enter into contracts to use the Service. The Service is intended for business use. You may not use the Service if you are prohibited from doing so under applicable laws.
            </p>

            <h3 className="text-base font-semibold text-gray-900">2.2 Registration</h3>
            <p>
              You agree to provide accurate, current, and complete information during registration and to keep that information up to date. You are responsible for safeguarding your account credentials and for all activity that occurs under your account. Notify us immediately at <a className="underline" href="mailto:security@reviewconcierge.ai">security@reviewconcierge.ai</a> if you suspect unauthorized access.
            </p>

            <h3 className="text-base font-semibold text-gray-900">2.3 Multi-user accounts</h3>
            <p>
              If multiple people access your account (owners, managers, staff), you are responsible for their compliance with these Terms.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">3. Subscriptions, trials, and billing</h2>
            <h3 className="text-base font-semibold text-gray-900">3.1 Subscription plans</h3>
            <p>
              The Service is provided on a monthly or annual subscription basis at the pricing displayed on our website. Current pricing: <span className="font-medium">$49.00 USD per month</span> per organization (subject to change with notice).
            </p>

            <h3 className="text-base font-semibold text-gray-900">3.2 Free trial</h3>
            <p>
              New customers may be offered a free trial period, typically 14 days, with select founding customers offered 30 days. At the end of the trial, your subscription automatically converts to a paid subscription at the then-current price unless you cancel before the trial ends. You can cancel at any time before the trial ends at no charge.
            </p>

            <h3 className="text-base font-semibold text-gray-900">3.3 Billing</h3>
            <p>
              Subscription fees are billed in advance through our payment processor, Stripe. By providing payment information, you authorize us to charge your payment method for all applicable fees. Fees are quoted and charged in U.S. dollars unless otherwise specified. Fees are exclusive of any applicable taxes; you are responsible for all taxes associated with your subscription, excluding taxes based on our net income.
            </p>

            <h3 className="text-base font-semibold text-gray-900">3.4 Refunds</h3>
            <p>
              Subscriptions are non-refundable, except as required by applicable law. If you cancel during a billing period, you will retain access to the Service through the end of the paid period; no prorated refunds are provided.
            </p>

            <h3 className="text-base font-semibold text-gray-900">3.5 Price changes</h3>
            <p>
              We may change our pricing at any time. We will provide at least 30 days&rsquo; notice of price increases for your subscription, which will take effect at your next renewal after the notice period. Continued use after the price change constitutes acceptance.
            </p>

            <h3 className="text-base font-semibold text-gray-900">3.6 Failed payments</h3>
            <p>
              If a payment fails, we may retry the charge and may suspend the Service if payment is not received within a reasonable period. Suspended accounts may lose access to data after 30 days if the account remains unpaid.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">4. Your responsibilities and acceptable use</h2>
            <h3 className="text-base font-semibold text-gray-900">4.1 You own your content</h3>
            <p>
              You retain ownership of all content you provide to the Service, including voice samples, configured preferences, and any edits you make to draft replies. By providing content, you grant us a limited, non-exclusive, royalty-free license to use it solely to provide and improve the Service for you.
            </p>

            <h3 className="text-base font-semibold text-gray-900">4.2 You are responsible for published replies</h3>
            <p>
              When you approve a draft reply, you are publishing that reply on Google on your behalf. You are responsible for the content of all published replies, including ensuring they accurately represent your business, do not misrepresent your identity or the identity of any staff member, do not make false, defamatory, or misleading statements about reviewers or third parties, do not include confidential customer information, comply with Google&rsquo;s review reply guidelines, and comply with all applicable laws.
            </p>

            <h3 className="text-base font-semibold text-gray-900">4.3 Prohibited use</h3>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Post fake or incentivized reviews or replies</li>
              <li>Impersonate any person or entity</li>
              <li>Engage in review manipulation, reviewer harassment, or retaliatory conduct</li>
              <li>Violate any applicable law or regulation, including consumer protection, advertising, and privacy laws</li>
              <li>Infringe the intellectual property rights of others</li>
              <li>Transmit malware, viruses, or other harmful code</li>
              <li>Attempt to reverse-engineer, decompile, or derive source code from the Service</li>
              <li>Access the Service through automated means except through any official APIs we may provide</li>
              <li>Resell, sublicense, or make the Service available to third parties outside your organization</li>
              <li>Use the Service to compete with us by building a substantially similar product</li>
              <li>Use the Service in any manner that could damage, disable, overburden, or impair our servers or networks</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-900">4.4 Google Business Profile compliance</h3>
            <p>
              You represent that you have the authority to grant ReviewConcierge access to the Google Business Profile(s) you connect to the Service. You are responsible for compliance with Google&rsquo;s Business Profile policies, and you understand that Google may suspend your profile if it detects policy violations. We are not responsible for actions Google takes regarding your profile.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">5. Our intellectual property</h2>
            <p>
              The Service, including all software, designs, text, graphics, and other content we provide, is owned by ReviewConcierge or its licensors and protected by intellectual property laws. We grant you a limited, non-exclusive, non-transferable, revocable license to use the Service in accordance with these Terms. You may not copy, modify, distribute, sell, lease, or create derivative works from any part of the Service without our written permission.
            </p>
            <p>
              <span className="font-medium">Feedback:</span> If you provide feedback, suggestions, or ideas about the Service, we may use them without restriction or compensation to you.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">6. AI-generated content</h2>
            <p>
              Draft replies generated by the Service are produced by artificial intelligence models. While we strive for high quality, AI-generated drafts may occasionally contain errors, inaccuracies, or inappropriate content. You are responsible for reviewing and approving every draft before it is posted. We do not warrant that AI-generated drafts will be free of error, factually accurate, or suitable for any particular use. Your approval of a draft constitutes your editorial adoption of that content as your own.
            </p>
            <p>
              You agree that we are not responsible for consequences arising from published replies that you approved, even where the underlying draft was AI-generated.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">7. Third-party services</h2>
            <p>
              The Service relies on third-party services including Google Business Profile APIs, Stripe, Supabase, Anthropic, Vercel, and others. Your use of the Service is subject to the applicable terms of these third parties where they directly govern your interaction with them (for example, Google&rsquo;s Terms of Service when you authorize access to your Google account). We are not responsible for the availability, accuracy, or content of third-party services, and service disruptions at any third-party provider may affect the Service.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">8. Termination</h2>
            <h3 className="text-base font-semibold text-gray-900">8.1 Termination by you</h3>
            <p>
              You may cancel your subscription at any time from the dashboard or by emailing <a className="underline" href="mailto:support@reviewconcierge.ai">support@reviewconcierge.ai</a>. Cancellation takes effect at the end of the current billing period.
            </p>

            <h3 className="text-base font-semibold text-gray-900">8.2 Termination by us</h3>
            <p>
              We may suspend or terminate your access to the Service at any time, with or without notice, if you violate these Terms, engage in fraudulent, abusive, or illegal activity, we are required to do so by law, continued provision of the Service is no longer commercially viable, or you fail to pay fees when due. For non-material breaches, we will generally provide notice and an opportunity to cure before terminating.
            </p>

            <h3 className="text-base font-semibold text-gray-900">8.3 Effect of termination</h3>
            <p>On termination:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Your access to the Service ends</li>
              <li>OAuth tokens and Manager access grants to your Google Business Profile are revoked on our side</li>
              <li>Your data is retained for 30 days (in case of accidental termination) and then deleted</li>
              <li>Any accrued fees remain payable</li>
              <li>Sections that by their nature should survive termination (including Sections 5, 9, 10, 11, 12, 13) survive</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">9. Disclaimers</h2>
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
            </p>
            <p>
              WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS. WE DO NOT WARRANT THAT AI-GENERATED CONTENT WILL BE ACCURATE, COMPLETE, OR SUITABLE FOR YOUR INTENDED USE. YOUR USE OF THE SERVICE IS AT YOUR OWN RISK.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">10. Limitation of liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, REVIEWCONCIERGE, ITS OFFICERS, EMPLOYEES, CONTRACTORS, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p>
              OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE IS LIMITED TO THE GREATER OF: (A) THE AMOUNT YOU PAID US IN THE TWELVE MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100).
            </p>

            <h2 className="text-xl font-semibold text-gray-900">11. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless ReviewConcierge and its officers, employees, contractors, and agents from any claims, damages, losses, liabilities, and expenses (including reasonable attorneys&rsquo; fees) arising out of or related to your use or misuse of the Service, your violation of these Terms, your violation of any law or rights of any third party, content you publish through the Service (including approved reply content), and your Google Business Profile and any disputes with Google concerning it.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">12. Governing law and dispute resolution</h2>
            <h3 className="text-base font-semibold text-gray-900">12.1 Governing law</h3>
            <p>
              These Terms are governed by the laws of the State of California, USA, without regard to its conflict of law principles. Nothing in this section deprives consumers located in jurisdictions with non-waivable consumer protections of the benefit of those protections.
            </p>

            <h3 className="text-base font-semibold text-gray-900">12.2 Arbitration agreement</h3>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Please read this section carefully. It affects your legal rights.</span>
              </p>
            </div>
            <p>
              Any dispute, claim, or controversy arising out of or relating to these Terms or the Service (each a &ldquo;Dispute&rdquo;) that cannot be resolved informally within 30 days of written notice will be resolved by <span className="font-medium">binding arbitration</span> administered by JAMS (Judicial Arbitration and Mediation Services) under its Streamlined Arbitration Rules and Procedures, or under an alternative set of rules JAMS applies to consumer arbitrations if applicable. The arbitration will be conducted by a single arbitrator in San Francisco, California, or by video conference at the election of the party initiating arbitration. The arbitrator&rsquo;s decision is final and binding. Judgment on the arbitrator&rsquo;s award may be entered in any court of competent jurisdiction.
            </p>

            <h3 className="text-base font-semibold text-gray-900">12.3 Class action waiver</h3>
            <p>
              YOU AND WE AGREE THAT DISPUTES WILL BE RESOLVED ONLY ON AN INDIVIDUAL BASIS AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, CONSOLIDATED, OR REPRESENTATIVE PROCEEDING. The arbitrator may not consolidate claims of multiple parties and may not award class-wide relief.
            </p>

            <h3 className="text-base font-semibold text-gray-900">12.4 Exceptions</h3>
            <p>
              The arbitration agreement does not apply to disputes that can be brought in small claims court (subject to the court&rsquo;s jurisdictional limits), claims for injunctive or equitable relief to protect intellectual property rights, or disputes where applicable law prohibits arbitration of consumer claims.
            </p>

            <h3 className="text-base font-semibold text-gray-900">12.5 Opt-out</h3>
            <p>
              You may opt out of the arbitration agreement by emailing <a className="underline" href="mailto:legal@reviewconcierge.ai">legal@reviewconcierge.ai</a> within 30 days of first accepting these Terms with the subject line &ldquo;Arbitration Opt-Out&rdquo; and including your full name, email, and a statement that you wish to opt out. Opting out does not affect other provisions of these Terms.
            </p>

            <h3 className="text-base font-semibold text-gray-900">12.6 Non-U.S. customers</h3>
            <p>
              If you are located outside the United States, the arbitration provisions above may be unenforceable in your jurisdiction. In that case, disputes will be resolved in the courts of San Francisco County, California, or in your local courts to the extent required by mandatory consumer protection law in your jurisdiction.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">13. General provisions</h2>
            <p>
              <span className="font-medium">Changes to the Service.</span> We may modify, suspend, or discontinue features of the Service at any time. We will provide reasonable notice of material changes where practical.
            </p>
            <p>
              <span className="font-medium">Changes to these Terms.</span> We may update these Terms from time to time. Material changes will be communicated by email to active customers at least 30 days before taking effect, and will be posted on this page with a revised &ldquo;Last updated&rdquo; date. Continued use after changes take effect constitutes acceptance. If you do not agree to the changes, you may cancel your subscription.
            </p>
            <p>
              <span className="font-medium">Assignment.</span> You may not assign these Terms without our prior written consent. We may assign these Terms to any affiliate or successor in connection with a merger, acquisition, or sale of assets, with notice to you.
            </p>
            <p>
              <span className="font-medium">Notices.</span> Notices to you will be sent by email to the address on your account or posted in the Service. Notices to us should be sent to <a className="underline" href="mailto:legal@reviewconcierge.ai">legal@reviewconcierge.ai</a> or by post to the business address listed in our Privacy Policy.
            </p>
            <p>
              <span className="font-medium">Severability.</span> If any provision of these Terms is held to be invalid or unenforceable, that provision will be modified to the minimum extent necessary to make it enforceable, and the remaining provisions will remain in full force and effect.
            </p>
            <p>
              <span className="font-medium">No waiver.</span> Our failure to enforce any provision of these Terms is not a waiver of that provision or any other provision.
            </p>
            <p>
              <span className="font-medium">Entire agreement.</span> These Terms, together with the <Link className="underline" href="/privacy">Privacy Policy</Link> and any other agreements you enter into with us, constitute the entire agreement between you and ReviewConcierge concerning the Service and supersede all prior agreements or understandings.
            </p>
            <p>
              <span className="font-medium">Force majeure.</span> We are not liable for failure or delay in performance due to causes beyond our reasonable control, including natural disasters, war, terrorism, labor disputes, government actions, internet or telecommunications failures, or third-party service outages.
            </p>
            <p>
              <span className="font-medium">Export compliance.</span> You represent that you are not located in a country subject to U.S. government embargo and are not on any U.S. government list of prohibited or restricted parties.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">14. Contact</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><span className="font-medium">General questions:</span> <a className="underline" href="mailto:support@reviewconcierge.ai">support@reviewconcierge.ai</a></li>
              <li><span className="font-medium">Legal notices:</span> <a className="underline" href="mailto:legal@reviewconcierge.ai">legal@reviewconcierge.ai</a></li>
              <li><span className="font-medium">Privacy questions:</span> <a className="underline" href="mailto:privacy@reviewconcierge.ai">privacy@reviewconcierge.ai</a></li>
              <li><span className="font-medium">Security incidents:</span> <a className="underline" href="mailto:security@reviewconcierge.ai">security@reviewconcierge.ai</a></li>
            </ul>
            <p>
              <span className="font-medium">Business address:</span><br />
              Kyle McKay<br />
              ReviewConcierge<br />
              2021 Fillmore Street, PMB #1105<br />
              San Francisco, CA 94115-2708<br />
              United States
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}