import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="space-y-6">
          <header className="space-y-2">
            <p className="text-sm text-gray-500">
              <Link href="/" className="hover:underline">← Home</Link>
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Contact
            </h1>
            <p className="text-gray-700">
              Need help or want to talk through onboarding? Email us:
            </p>
          </header>

          <div className="rounded-2xl border border-gray-200 p-6">
            <p className="text-gray-700">
              Support:{" "}
              <a className="underline" href="mailto:support@reviewconcierge.ai">
                support@reviewconcierge.ai
              </a>
            </p>
            <p className="text-gray-700 mt-2">
              Sales / partnerships:{" "}
              <a className="underline" href="mailto:hello@reviewconcierge.ai">
                hello@reviewconcierge.ai
              </a>
            </p>
            <p className="text-sm text-gray-500 mt-4">
              Please include your account email + business name for fastest help.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
