import Link from "next/link";

const LAST_UPDATED = "January 5, 2026";

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
              Review Concierge.ai (“Review Concierge”, “we”, “us”, “our”) respects your
              privacy. This Privacy Policy explains what information we collect, how we use
              it, and the choices you have.
            </p>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Important:</span> Review
                Concierge generates reply drafts to help you respond faster and stay on-brand.
                <span className="font-medium text-gray-900"> We do not post replies on your
                behalf without your explicit action/approval.</span>
              </p>
            </div>

            <h2 className="text-xl font-semibold text-gray-900">Information we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-medium">Account information:</span> your email address
                and authentication details needed to sign in.
              </li>
              <li>
                <span className="font-medium">Organization and business information:</span>{" "}
                business name and identifiers you provide (e.g., a Google Place ID) and any
                related business metadata.
              </li>
              <li>
                <span className="font-medium">Review data:</span> review content and related
                fields returned by Google APIs for the business you select (e.g., rating,
                author name, review text, review date, language). Note: some Google APIs may
                return a sample of recent reviews rather than your full history.
              </li>
              <li>
                <span className="font-medium">Payment and billing information:</span> if you
                subscribe, payments are processed by our payment processor (e.g., Stripe). We
                typically receive subscription status and related identifiers, but we do not
                store full card numbers.
              </li>
              <li>
                <span className="font-medium">Usage and device data:</span> basic logs for
                reliability, debugging, fraud prevention, and security (e.g., timestamps,
                actions, and limited technical signals such as IP address).
              </li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">How we use information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Provide and operate the product (dashboard, syncing, reply drafting).</li>
              <li>Authenticate users and enforce organization-level access controls.</li>
              <li>Process subscriptions, manage billing status, and prevent fraud/abuse.</li>
              <li>Maintain security, troubleshoot issues, and improve performance.</li>
              <li>Communicate service-related messages (e.g., onboarding, updates, support).</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">How we share information</h2>
            <p>We do not sell your personal information.</p>
            <p>
              We may share information with service providers that help us operate the
              service, such as:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-medium">Infrastructure &amp; hosting</span> (to run the
                application)
              </li>
              <li>
                <span className="font-medium">Database/auth providers</span> (to store and
                secure your account and app data)
              </li>
              <li>
                <span className="font-medium">Payment processing</span> (to handle billing
                and subscription status)
              </li>
            </ul>
            <p>
              We share only what is necessary for these providers to perform services on our
              behalf, subject to contractual confidentiality and security obligations.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Cookies and similar technologies</h2>
            <p>
              We use cookies and similar technologies to keep you signed in and to operate
              core site functionality (for example, authentication/session cookies). If we
              add analytics or advertising cookies in the future, we will update this policy
              and our Cookies page accordingly.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Data retention</h2>
            <p>
              We retain information as long as necessary to provide the service, comply with
              legal obligations, resolve disputes, and enforce agreements. You may request
              deletion of your account and associated data, subject to any legal retention
              requirements.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Security</h2>
            <p>
              We use reasonable administrative, technical, and organizational safeguards
              designed to protect information. No method of transmission or storage is 100%
              secure, but we work to protect your data and limit access to authorized
              personnel and systems.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Your choices and rights</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You can update or correct certain account details within the app (when available).</li>
              <li>You can request access or deletion by contacting us.</li>
              <li>You can stop using the service and request account deletion at any time.</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">Children’s privacy</h2>
            <p>
              Review Concierge is not intended for children. If you believe a child has
              provided us personal information, contact us and we will take appropriate
              steps to delete it.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Changes to this policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material
              changes, we will update the “Last updated” date and may provide additional
              notice in the app.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
            <p>
              Questions or requests? Email{" "}
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
