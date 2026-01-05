import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-sm text-gray-500">
              <Link href="/" className="hover:underline">← Home</Link>
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Privacy Policy
            </h1>
            <p className="text-sm text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </header>

          <section className="space-y-3 text-gray-700">
            <p>
              Review Concierge.ai (“Review Concierge”, “we”, “us”) respects your privacy.
              This Privacy Policy explains what we collect, how we use it, and your choices.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Information we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><span className="font-medium">Account info:</span> email address, name (optional), organization details.</li>
              <li><span className="font-medium">Connected data:</span> when you connect a Google account, we may fetch review content and business identifiers you authorize.</li>
              <li><span className="font-medium">Usage data:</span> basic logs for reliability, debugging, and security (e.g., timestamps, actions, IP/device signals).</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">How we use information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Provide the product (review sync, reply drafting, dashboards).</li>
              <li>Maintain security, prevent fraud/abuse, and debug issues.</li>
              <li>Improve features and user experience.</li>
              <li>Communicate product updates and account notices.</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">Data sharing</h2>
            <p>
              We do not sell your personal data. We may share data with service providers
              that help operate the product (e.g., hosting, analytics, payment processing),
              under confidentiality and only as needed to deliver services.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Data retention</h2>
            <p>
              We retain data only as long as necessary to provide the service, comply with legal
              obligations, resolve disputes, and enforce agreements.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Your choices</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You can disconnect integrations and stop syncing.</li>
              <li>You can request account deletion by contacting us.</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
            <p>
              Questions? Contact us at{" "}
              <a className="underline" href="mailto:support@reviewconcierge.ai">
                support@reviewconcierge.ai
              </a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
