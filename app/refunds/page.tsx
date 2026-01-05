import Link from "next/link";

export default function RefundsPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-sm text-gray-500">
              <Link href="/" className="hover:underline">← Home</Link>
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Refund & Cancellation Policy
            </h1>
            <p className="text-sm text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </header>

          <section className="space-y-3 text-gray-700">
            <h2 className="text-xl font-semibold text-gray-900">Cancel anytime</h2>
            <p>
              You can cancel your subscription at any time. After cancellation, you will retain access
              until the end of your current billing period unless stated otherwise at checkout.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Refunds</h2>
            <p>
              Unless required by law, subscription fees are generally non-refundable once a billing
              period starts. If you believe you were billed in error, contact us and we’ll review it.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Trials (if offered)</h2>
            <p>
              If a free trial is offered, trial terms are shown at checkout. You can cancel before
              the trial ends to avoid charges.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
            <p>
              Email{" "}
              <a className="underline" href="mailto:support@reviewconcierge.ai">
                support@reviewconcierge.ai
              </a>{" "}
              with your account email and a brief description.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
