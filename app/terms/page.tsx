import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-sm text-gray-500">
              <Link href="/" className="hover:underline">← Home</Link>
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Terms of Service
            </h1>
            <p className="text-sm text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </header>

          <section className="space-y-3 text-gray-700">
            <p>
              By using Review Concierge.ai (“Service”), you agree to these Terms of Service.
              If you do not agree, do not use the Service.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Use of the Service</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must provide accurate account information.</li>
              <li>You are responsible for activity under your account.</li>
              <li>You may not abuse, reverse engineer, or disrupt the Service.</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">Integrations and content</h2>
            <p>
              If you connect third-party services (e.g., Google), you grant us permission to
              access data you authorize for the purposes of providing the Service. You
              represent you have the right to connect and use that data.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">AI-generated output</h2>
            <p>
              The Service may generate suggested reply drafts. You are responsible for reviewing
              and deciding whether to use or publish any content. The Service does not guarantee
              accuracy or outcomes.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Payments</h2>
            <p>
              Paid features require an active subscription. Billing terms, trial terms (if offered),
              and pricing are shown at checkout.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Disclaimer</h2>
            <p>
              The Service is provided “as is” without warranties of any kind. To the maximum extent
              permitted by law, we disclaim implied warranties and are not liable for indirect or
              consequential damages.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Termination</h2>
            <p>
              You may stop using the Service at any time. We may suspend or terminate access for
              violations of these Terms or to protect the Service.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
            <p>
              Questions? Email{" "}
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
