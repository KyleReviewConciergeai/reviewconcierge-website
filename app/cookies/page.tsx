import Link from "next/link";

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-sm text-gray-500">
              <Link href="/" className="hover:underline">← Home</Link>
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Cookie Policy
            </h1>
            <p className="text-sm text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </header>

          <section className="space-y-3 text-gray-700">
            <p>
              Cookies are small files stored on your device. We use cookies and similar technologies
              to keep you logged in, maintain security, and improve the product.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Types of cookies</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><span className="font-medium">Essential:</span> authentication, security, session management.</li>
              <li><span className="font-medium">Performance:</span> basic analytics and error monitoring (if enabled).</li>
            </ul>

            <h2 className="text-xl font-semibold text-gray-900">Managing cookies</h2>
            <p>
              You can control cookies through your browser settings. Disabling essential cookies may
              prevent the Service from functioning properly.
            </p>

            <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
            <p>
              Questions?{" "}
              <a className="underline" href="mailto:support@reviewconcierge.ai">
                support@reviewconcierge.ai
              </a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
