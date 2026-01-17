"use client";

import Link from "next/link";

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="space-y-6">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            Welcome to Review Concierge
          </h1>

          <p className="text-base text-gray-700">
            Review Concierge helps you draft short, human replies that sound like{" "}
            <span className="font-medium">you</span>. You stay in control — every time.
          </p>

          <p className="text-sm text-gray-600">
            Review Concierge never posts replies on your behalf. You always review and publish them yourself.
          </p>

          {/* Primary CTA */}
          <div className="rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="space-y-3">
              <Link
                href="/connect/google"
                className="inline-flex w-full items-center justify-center rounded-xl bg-black px-5 py-3 text-white font-semibold hover:bg-gray-900 transition shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-black/20 focus:ring-offset-2"
              >
                Connect your Google listing
              </Link>

              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-gray-700">
                  We draft. You approve, edit, and post.
                </p>

                <Link
                  href="/dashboard"
                  className="shrink-0 text-sm text-gray-500 hover:text-gray-700 hover:underline"
                >
                  Go to dashboard →
                </Link>
              </div>

              <p className="text-sm text-gray-600">
                After you connect, you’ll see your recent reviews and can generate replies in your voice.
              </p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* What happens next */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">What happens next</h2>

            <ol className="space-y-2 text-gray-700">
              <li>
                <div className="text-gray-900 font-medium">1) Connect</div>
                <div className="text-sm text-gray-600">
                  Link your Google listing so we can pull in your reviews.
                </div>
              </li>

              <li>
                <div className="text-gray-900 font-medium">2) Paste a review → draft a reply</div>
                <div className="text-sm text-gray-600">
                  Get a short reply draft that’s human and believable — not generic AI.
                </div>
              </li>

              <li>
                <div className="text-gray-900 font-medium">3) Copy, tweak if you want, and post</div>
                <div className="text-sm text-gray-600">
                  You decide what goes live.
                </div>
              </li>
            </ol>
          </div>

          {/* Reassurance */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
            <p className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">Your voice stays yours.</span>{" "}
              Review Concierge never posts replies for you. It only drafts suggestions you can copy and use.
            </p>
          </div>

          {/* Founder trust line */}
          <div className="text-sm text-gray-700">
            <p className="font-medium text-gray-900">Founder note</p>
            <p className="text-gray-600">
              I’m personally onboarding early customers. If you want help, reply to the welcome email.
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
