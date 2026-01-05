import Link from "next/link";

const LAST_UPDATED = "January 5, 2026";

export default function ContactPage() {
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
              Contact
            </h1>

            <p className="text-sm text-gray-600">
              Last updated: {LAST_UPDATED}
            </p>

            <p className="text-gray-700">
              Need help, have a question, or want to talk through onboarding?
              We’d love to hear from you.
            </p>
          </header>

          <div className="rounded-2xl border border-gray-200 p-6 space-y-3">
            <p className="text-gray-700">
              <span className="font-medium">Support:</span>{" "}
              <a
                className="underline"
                href="mailto:support@reviewconcierge.ai"
              >
                support@reviewconcierge.ai
              </a>
            </p>

            <p className="text-gray-700">
              <span className="font-medium">Sales / partnerships:</span>{" "}
              <a
                className="underline"
                href="mailto:hello@reviewconcierge.ai"
              >
                hello@reviewconcierge.ai
              </a>
            </p>

            <p className="text-sm text-gray-500 pt-2">
              For the fastest help, please include your account email and
              business name.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
