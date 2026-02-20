"use client";

import React, { useMemo, useState } from "react";

type DraftReplyResponse = {
  ok: boolean;
  reply?: string;
  error?: string;
};

type ResultRow = {
  rating: number;
  ok: boolean;
  reply: string;
  error?: string;
  openerTag: string;
  hasWeRegret: boolean;
  hasPlaceholder: boolean;
};

function detectOpenerTag(reply: string) {
  const t = (reply || "").trim().toLowerCase();

  if (!t) return "empty";
  if (t.startsWith("we regret") || t.startsWith("we regret that")) return "we_regret";
  if (t.startsWith("sorry") || t.startsWith("we're sorry") || t.startsWith("we are sorry"))
    return "sorry";
  if (t.startsWith("thank you") || t.startsWith("thanks")) return "thanks";
  if (t.startsWith("hi") || t.startsWith("hey") || t.startsWith("hello")) return "greeting";
  if (t.startsWith("appreciate")) return "appreciate";
  return "other";
}

function hasPlaceholderLeak(reply: string) {
  return /\[(email\/phone|email|phone)\]/i.test(reply || "");
}

function pickReviewTextForRating(rating: number) {
  if (rating <= 2) {
    return "Waited over an hour even with a reservation and our server barely checked on us. Steak came out undercooked and it was awkward when we mentioned it. Not coming back.";
  }
  if (rating === 3) {
    return "Food was decent and the place is nice, but service was slow and we had to ask twice for the check.";
  }
  if (rating === 4) {
    return "Really enjoyed the vibe and the food was great. Only thing is it was pretty loud inside.";
  }
  return "Amazing dinner — the grilled chicken and kofta were both excellent, and the staff was super friendly.";
}

export default function RatingHarnessPage() {
  // Dev-only guard (client-side)
  const isDev = process.env.NODE_ENV !== "production";

  const [runsPerRating, setRunsPerRating] = useState<number>(5);
  const [businessName, setBusinessName] = useState<string>("Lokma");
  const [language, setLanguage] = useState<string>("en");
  const [tone, setTone] = useState<string>("warm");
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [lastError, setLastError] = useState<string>("");

  const stats = useMemo(() => {
    const byRating: Record<number, ResultRow[]> = {};
    for (const r of results) {
      byRating[r.rating] = byRating[r.rating] || [];
      byRating[r.rating].push(r);
    }

    function summarize(rows: ResultRow[]) {
      const total = rows.length || 1;
      const count = (tag: string) => rows.filter((x) => x.openerTag === tag).length;
      return {
        total: rows.length,
        ok: rows.filter((x) => x.ok).length,
        sorry: count("sorry"),
        thanks: count("thanks"),
        greeting: count("greeting"),
        appreciate: count("appreciate"),
        we_regret: count("we_regret"),
        other: count("other"),
        placeholderLeaks: rows.filter((x) => x.hasPlaceholder).length,
        weRegretLeaks: rows.filter((x) => x.hasWeRegret).length,
        okRate: Math.round((rows.filter((x) => x.ok).length / total) * 100),
      };
    }

    return {
      1: summarize(byRating[1] || []),
      2: summarize(byRating[2] || []),
      3: summarize(byRating[3] || []),
      4: summarize(byRating[4] || []),
      5: summarize(byRating[5] || []),
    };
  }, [results]);

  async function runHarness() {
    setLoading(true);
    setLastError("");
    setResults([]);

    try {
      const all: ResultRow[] = [];

      for (const rating of [1, 2, 3, 4, 5]) {
        for (let i = 0; i < runsPerRating; i++) {
          const review_text = pickReviewTextForRating(rating);

          const res = await fetch("/api/reviews/draft-reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              business_name: businessName,
              rating,
              language, // reviewer_language meta only; owner language is org setting
              tone,
              review_text,
            }),
          });

          const json = (await res.json().catch(() => null)) as DraftReplyResponse | null;

          const reply = (json?.reply || "").trim();
          const ok = Boolean(json?.ok) && Boolean(reply);
          const openerTag = detectOpenerTag(reply);
          const hasWeRegret = /^we\s+regret\b/i.test(reply);
          const hasPlaceholder = hasPlaceholderLeak(reply);

          all.push({
            rating,
            ok,
            reply,
            error: ok ? undefined : json?.error || `HTTP ${res.status}`,
            openerTag,
            hasWeRegret,
            hasPlaceholder,
          });
        }
      }

      setResults(all);
    } catch (e: any) {
      setLastError(e?.message || "Harness error");
    } finally {
      setLoading(false);
    }
  }

  if (!isDev) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="font-medium">Rating harness is disabled in production.</div>
          <div className="mt-2 opacity-80">
            This page is meant for local/dev validation only.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 text-sm">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-lg font-semibold">A2.3 — Rating Harness (Dev)</div>
        <div className="mt-1 opacity-80">
          Generates multiple drafts per rating and shows opener / leak stats.
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs opacity-70 mb-1">Runs per rating</label>
            <input
              type="number"
              min={1}
              max={20}
              value={runsPerRating}
              onChange={(e) => setRunsPerRating(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs opacity-70 mb-1">Business name</label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs opacity-70 mb-1">Reviewer language (meta)</label>
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-xs opacity-70 mb-1">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            >
              <option value="warm">warm</option>
              <option value="neutral">neutral</option>
              <option value="direct">direct</option>
              <option value="playful">playful</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex gap-3 items-center">
          <button
            onClick={runHarness}
            disabled={loading}
            className="rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 px-4 py-2 font-medium"
          >
            {loading ? "Running…" : "Run harness"}
          </button>
          {lastError ? <div className="text-red-300">{lastError}</div> : null}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((r) => {
          const s = (stats as any)[r];
          return (
            <div key={r} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="font-semibold">{r}★</div>
              <div className="mt-2 space-y-1 opacity-90">
                <div>OK: {s.ok}/{s.total} ({s.okRate}%)</div>
                <div>sorry: {s.sorry}</div>
                <div>thanks: {s.thanks}</div>
                <div>greeting: {s.greeting}</div>
                <div>appreciate: {s.appreciate}</div>
                <div>we regret: {s.we_regret}</div>
                <div>other: {s.other}</div>
                <div className={s.placeholderLeaks ? "text-red-300" : ""}>
                  placeholders: {s.placeholderLeaks}
                </div>
                <div className={s.weRegretLeaks ? "text-red-300" : ""}>
                  we regret leaks: {s.weRegretLeaks}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Samples */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="font-semibold">Samples</div>
        <div className="mt-3 space-y-3">
          {results.length === 0 ? (
            <div className="opacity-70">Run the harness to see samples.</div>
          ) : (
            results.slice(0, 25).map((r, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-white/10 bg-black/20 p-3"
              >
                <div className="flex flex-wrap gap-2 items-center text-xs opacity-80">
                  <span className="font-semibold">{r.rating}★</span>
                  <span>opener: {r.openerTag}</span>
                  {r.hasWeRegret ? <span className="text-red-300">weRegret</span> : null}
                  {r.hasPlaceholder ? (
                    <span className="text-red-300">placeholder</span>
                  ) : null}
                  {!r.ok ? <span className="text-red-300">{r.error}</span> : null}
                </div>
                <div className="mt-2 whitespace-pre-wrap">{r.reply || "(empty)"}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
