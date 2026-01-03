"use client";

import Link from "next/link";

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="space-y-6">
          <h1 className="text-3xl font-semibold tracking-tight">
            🎉 Welcome to Review Concierge
          </h1>

          <p className="text-base text-gray-700">
            You’re officially in. Let’s pull your Google reviews and draft your first
            AI-written reply in under <span className="font-medium">2 minutes</span>.
          </p>

          {/* Primary CTA */}
          <div className="rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="space-y-3">
              <Link
                href="/connect/google"
                className="inline-flex w-full items-center justify-center rounded-xl bg-black px-5 py-3 text-white font-medium hover:bg-gray-900"
              >
                Connect Google Reviews
              </Link>

              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  Secure access. We never post without your approval.
                </p>

                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-gray-900 underline underline-offset-4 hover:text-gray-700"
                >
                  Skip for now →
                </Link>
              </div>

              <p className="text-xs text-gray-500">
                Demo note: this pulls a recent sample via Google Places today. Full review history sync
                comes in Phase 2 via Google Business Profile.
              </p>
            </div>
          </div>

          {/* What happens next */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">What happens next</h2>

            <ol className="space-y-3 text-gray-700">
              <li>
                <span className="font-medium">1) 🔗 Connect Google</span>
                <div className="text-sm text-gray-600">
                  Find your business and verify in seconds (best on iPhone too).
                </div>
              </li>

              <li>
                <span className="font-medium">2) ✨ Review AI replies</span>
                <div className="text-sm text-gray-600">
                  Drafts match your brand voice and tone.
                </div>
              </li>

              <li>
                <span className="font-medium">3) 📋 Copy & paste into Google</span>
                <div className="text-sm text-gray-600">
                  (Auto-posting can come later.)
                </div>
              </li>
            </ol>
          </div>

          {/* Trial reassurance */}
          <div className="rounded-2xl bg-gray-50 p-6">
            <p className="text-sm text-gray-700">
              ⏳ You’re on a <span className="font-medium">14-day free trial</span>.
              We’ll email you before billing starts. Cancel anytime.
            </p>
          </div>

          {/* Founder trust line */}
          <div className="text-sm text-gray-700">
            <p className="font-medium">Founder note</p>
            <p className="text-gray-600">
              I’m personally onboarding our first group of founders. If you want help,
              reply to the welcome email.
              <br />— Kyle
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
