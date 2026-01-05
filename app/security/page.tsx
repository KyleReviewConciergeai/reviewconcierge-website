import Link from "next/link";

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-sm text-gray-500">
              <Link href="/" className="hover:underline">← Home</Link>
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Security
            </h1>
            <p className="text-gray-700">
              We take security seriously. Here’s a high-level overview of our approach.
            </p>
          </header>

          <section className="space-y-4 text-gray-700">
            <div className="rounded-2xl border border-gray-200 p-6 space-y-3">
              <h2 className="text-xl font-semibold text-gray-900">Access control</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Authentication is required to access customer data.</li>
                <li>Organization scoping is enforced to prevent cross-tenant access.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6 space-y-3">
              <h2 className="text-xl font-semibold text-gray-900">Data protection</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Data is transmitted over HTTPS.</li>
                <li>We limit access to production systems and audit critical actions.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 p-6 space-y-3">
              <h2 className="text-xl font-semibold text-gray-900">Responsible disclosure</h2>
              <p>
                If you believe you’ve found a vulnerability, please email{" "}
                <a className="underline" href="mailto:security@reviewconcierge.ai">
                  security@reviewconcierge.ai
                </a>{" "}
                with details. We appreciate responsible disclosure.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
