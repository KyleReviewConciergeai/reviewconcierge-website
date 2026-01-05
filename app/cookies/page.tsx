import Link from "next/link";

const LAST_UPDATED = "January 5, 2026";

export default function CookiePolicyPage() {
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
              Cookie Policy
            </h1>

            <p className="text-sm text-gray-600">Last updated: {LAST_UPDATED}</p>
          </header>

          <section className="space-y-6 text-gray-700 leading-relaxed">
            <p>
              Cookies are small text files stored on your device. Review Concierge.ai uses cookies
              and similar technologies to ensure the Service works correctly, remains secure, and
              provides a smooth user experience.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Types of cookies we use</h2>

            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-medium">Essential cookies:</span> required for authentication,
                session management, and security. These enable features like logging in and staying
                signed in.
              </li>
              <li>
                <span className="font-medium">Performance cookies:</span> limited analytics or error
                monitoring used to understand system reliability and improve the Service (if
                enabled).
              </li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">Managing cookies</h2>
            <p>
              You can control or delete cookies through your browser settings. Please note that
              disabling essential cookies may prevent parts of the Service from functioning
              properly.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
            <p>
              If you have questions about our use of cookies, contact us at{" "}
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
