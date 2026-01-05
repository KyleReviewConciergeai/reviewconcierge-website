"use client";

import Link from "next/link";

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="space-y-6">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            🎉 Welcome to Review Concierge
          </h1>

          <p className="text-base text-gray-700">
            Your account is ready. Let’s connect Google and draft your first on-brand
            reply in under <span className="font-medium">2 minutes</span>.
          </p>

          {/* Primary CTA */}
          <div className="rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="space-y-3">
              <Link
                href="/connect/google"
                className="inline-flex w-full items-center justify-center rounded-xl bg-black px-5 py-3 text-white font-semibold hover:bg-gray-900 transition shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-black/20 focus:ring-offset-2"
              >
                Connect Google Business Profile
              </Link>

              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-gray-700">
                  Secure access. We never post without your approval.
                </p>

                <Link
                  href="/dashboard"
                  className="shrink-0 text-sm text-gray-500 hover:text-gray-700 hover:underline"
                >
                  Skip for now →
                </Link>
              </div>

              <p className="text-sm text-gray-600">
                Demo note: this pulls a recent sample via Google Places today. Full review
                history sync + direct posting comes in Phase 2 via Google Business Profile.
              </p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* What happens next */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">What happens next</h2>

            <ol className="space-y-2 text-gray-700">
              <li>
                <div className="text-gray-900 font-medium">1) 🔗 Connect Google</div>
                <div className="text-sm text-gray-600">
                  Pull in a recent sample of your Google reviews instantly.
                </div>
              </li>

              <li>
                <div className="text-gray-900 font-medium">
                  2) ✨ Google reviews, reply faster + stay on-brand
                </div>
                <div className="text-sm text-gray-600">
                  Generate reply drafts that match your voice and tone.
                </div>
              </li>

              <li>
                <div className="text-gray-900 font-medium">
                  3) 📋 Copy &amp; paste into Google
                </div>
                <div className="text-sm text-gray-600">
                  (Direct posting can come later.)
                </div>
              </li>
            </ol>
          </div>

          {/* Honest reassurance (no card yet) */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
            <p className="text-sm text-gray-700">
              🧭 <span className="font-medium text-gray-900">No billing yet.</span> You can
              explore Review Concierge and generate reply drafts without entering a credit
              card. When you’re ready to enable Google sync, you’ll be prompted to start a
              subscription.
            </p>
          </div>

          {/* Founder trust line */}
          <div className="text-sm text-gray-700">
            <p className="font-medium text-gray-900">Founder note</p>
            <p className="text-gray-600">
              I’m personally onboarding our first customers. If you want help, reply to the
              welcome email.
              <br />— Kyle
            </p>
          </div>

          {/* Footer links */}
          <div className="pt-6 border-t border-gray-200 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-2">
            <Link className="hover:underline" href="/privacy">
              Privacy Policy
            </Link>
            <Link className="hover:underline" href="/terms">
              Terms of Service
            </Link>
            <Link className="hover:underline" href="/refunds">
              Refund / Cancellation
            </Link>
            <Link className="hover:underline" href="/cookies">
              Cookie Policy
            </Link>
            <Link className="hover:underline" href="/security">
              Security
            </Link>
            <Link className="hover:underline" href="/contact">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
