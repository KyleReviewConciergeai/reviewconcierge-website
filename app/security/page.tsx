import Link from "next/link";

const LAST_UPDATED = "January 5, 2026";

export default function SecurityPage() {
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
              Security
            </h1>

            <p className="text-sm text-gray-600">Last updated: {LAST_UPDATED}</p>

            <p className="text-gray-700">
              We take security seriously. Below is a high-level overview of how Review
              Concierge protects your data.
            </p>
          </header>

          <section className="space-y-6 text-gray-700 leading-relaxed">
            <div className="rounded-2xl border border-gray-200 p-6 space-y-3">
              <h2 className="text-xl font-semibold text-gray-900">
                Access control
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Authentication is required to access customer data.</li>
                <li>
                  Organization-level scoping is enforced to prevent cross-tenant
                  access.
                </li>
                <li>
                  Sensitive operations are restricted to authorized server-side
                  contexts.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6 space-y-3">
              <h2 className="text-xl font-semibold text-gray-900">
                Data protection
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>All data is transmitted over encrypted HTTPS connections.</li>
                <li>
                  Access to production systems is limited and monitored.
                </li>
                <li>
                  Third-party providers (e.g. hosting, payments) are selected with
                  security best practices in mind.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6 space-y-3">
              <h2 className="text-xl font-semibold text-gray-900">
                Responsible disclosure
              </h2>
              <p>
                If you believe you have discovered a security vulnerability, please
                email{" "}
                <a
                  className="underline"
                  href="mailto:security@reviewconcierge.ai"
                >
                  security@reviewconcierge.ai
                </a>{" "}
                with details. We appreciate responsible disclosure and will
                investigate promptly.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
