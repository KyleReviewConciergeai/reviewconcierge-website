import Link from "next/link";

const LAST_UPDATED = "January 5, 2026";

export default function RefundsPage() {
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
              Refund &amp; Cancellation Policy
            </h1>

            <p className="text-sm text-gray-600">Last updated: {LAST_UPDATED}</p>
          </header>

          <section className="space-y-6 text-gray-700 leading-relaxed">
            <p>
              This policy explains how cancellations and refunds work for Review Concierge.ai
              subscriptions.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Cancel anytime</h2>
            <p>
              You may cancel your subscription at any time. Unless stated otherwise at checkout,
              cancellation stops future renewals and you will typically retain access until the end
              of your current billing period.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Refunds</h2>
            <p>
              Subscription fees are generally non-refundable once a billing period has started,
              except where required by law. We do not typically provide prorated refunds for unused
              time in a billing period.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Billing mistakes</h2>
            <p>
              If you believe you were billed in error (for example, duplicate charge or incorrect
              plan), contact us as soon as possible and we’ll review it. Please include your account
              email and any relevant invoice details.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Trials (if offered)</h2>
            <p>
              If we offer a free trial, the trial length and terms will be shown at checkout. You
              can cancel before the trial ends to avoid being charged.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
            <p>
              Email{" "}
              <a className="underline" href="mailto:support@reviewconcierge.ai">
                support@reviewconcierge.ai
              </a>{" "}
              with your account email and a brief description of the issue.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
