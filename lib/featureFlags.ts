// lib/featureFlags.ts
// Central feature flag registry.
// GBP_ENABLED=true  → use Google Business Profile ingest (real reviews)
// GBP_ENABLED=false → use Google Places fallback (recent sample up to 10)

export const GBP_ENABLED =
  process.env.GBP_ENABLED === "true" ||
  process.env.NEXT_PUBLIC_GBP_ENABLED === "true";