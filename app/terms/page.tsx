import Link from "next/link";

const LAST_UPDATED = "January 5, 2026";

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
              These Terms of Service (“Terms”) govern your access to and use of Review
              Concierge.ai (the “Service”). By creating an account or using the Service, you
              agree to these Terms. If you do not agree, do not use the Service.
            </p>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Important:</span> The Service
                generates suggested reply drafts. You are responsible for reviewing and
                deciding whether to use or publish any content. We do not post replies on
                your behalf without your explicit action/approval.
              </p>
            </div>

            <h2 className="text-xl font-semibold text-gray-900">1) Eligibility and accounts</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must be at least 18 years old to use the Service.</li>
              <li>You agree to provide accurate, current account information.</li>
              <li>
                You are responsible for maintaining the confidentiality of your login
                credentials and for all activity under your account.
              </li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">2) Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Use the Service for unlawful, harmful, or abusive purposes.</li>
              <li>Attempt to gain unauthorized access to the Service or related systems.</li>
              <li>
                Reverse engineer, decompile, or attempt to extract source code (except where
                prohibited by law).
              </li>
              <li>Interfere with or disrupt the Service, including rate-limiting circumvention.</li>
              <li>Use the Service to generate or distribute spam or deceptive content.</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">3) Integrations and third-party services</h2>
            <p>
              The Service may interact with third-party services (for example, Google APIs)
              to fetch business or review data. You represent that you have the right to
              access and use any data you provide or authorize through the Service.
            </p>
            <p>
              Third-party services are not under our control and may change, suspend, or
              discontinue functionality. We are not responsible for third-party services or
              their availability.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">4) Your content and permissions</h2>
            <p>
              You (or your organization) retain ownership of your content. You grant us a
              limited, non-exclusive, worldwide license to host, store, process, and display
              your content only as needed to provide and improve the Service.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">5) AI-generated output</h2>
            <p>
              The Service may generate suggested reply drafts and other outputs. Outputs may
              be inaccurate, incomplete, or inappropriate for your situation. You are solely
              responsible for reviewing outputs and ensuring they are correct, compliant,
              and suitable before using or publishing them.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">6) Subscriptions and payments</h2>
            <p>
              Certain features may require a paid subscription. Pricing and billing terms are
              presented at checkout. Subscriptions may renew automatically unless canceled.
            </p>
            <p>
              Payments are processed by third-party payment processors (for example, Stripe).
              We do not store full payment card details on our servers.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">7) Suspension and termination</h2>
            <p>
              You may stop using the Service at any time. We may suspend or terminate your
              access if we reasonably believe you violated these Terms, used the Service in a
              harmful manner, or if necessary to protect the Service or other users.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">8) Disclaimer of warranties</h2>
            <p>
              The Service is provided on an “as is” and “as available” basis. To the maximum
              extent permitted by law, we disclaim all warranties, express or implied,
              including implied warranties of merchantability, fitness for a particular
              purpose, and non-infringement.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">9) Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, Review Concierge will not be liable for
              any indirect, incidental, special, consequential, or punitive damages, or any
              loss of profits, revenue, data, or goodwill, arising from or related to your
              use of the Service.
            </p>
            <p>
              To the maximum extent permitted by law, our total liability for any claim
              arising out of or relating to the Service will not exceed the amounts you paid
              to us for the Service in the 3 months immediately preceding the event giving
              rise to the claim (or USD $100 if you have not paid anything).
            </p>

            <h2 className="text-xl font-semibold text-gray-900">10) Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Review Concierge from and against
              claims, liabilities, damages, losses, and expenses (including reasonable
              attorneys’ fees) arising out of your use of the Service, your content, or your
              violation of these Terms.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">11) Changes to the Service or Terms</h2>
            <p>
              We may update the Service and these Terms from time to time. If we make material
              changes, we will update the “Last updated” date and may provide additional
              notice in the app.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">12) Contact</h2>
            <p>
              Questions? Email{" "}
              <a className="underline" href="mailto:support@reviewconcierge.ai">
                support@reviewconcierge.ai
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
