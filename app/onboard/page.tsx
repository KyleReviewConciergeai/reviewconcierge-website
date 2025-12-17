'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardPage() {
  const router = useRouter()

  const [placeId, setPlaceId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      // 1) Create business row in Supabase (via API route)
      const created = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_place_id: placeId.trim() })
      })

      if (!created.ok) {
  const payload = await created.json().catch(() => null)
  throw new Error(payload?.error || 'Failed to create business')
}


      const { business } = await created.json()

      // 2) Import reviews from Google (GET)
      // ✅ If your /api/reviews/google is POST and accepts JSON:
      const imported = await fetch(
  `/api/reviews/google?google_place_id=${encodeURIComponent(business.google_place_id)}`
)

      // ⚠️ If your /api/reviews/google is GET, you will replace the block above with:
      // const imported = await fetch(`/api/reviews/google?business_id=${business.id}&google_place_id=${encodeURIComponent(business.google_place_id)}`)

      if (!imported.ok) {
  const payload = await imported.json().catch(() => null)
  throw new Error(payload?.error || 'Failed to import reviews')
}


      setSuccess(true)

      // 3) Redirect to dashboard
      setTimeout(() => router.push('/dashboard'), 900)
   } catch (err: any) {
  setError(err?.message || 'Could not onboard this business.')
} finally {
  setLoading(false)
}
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-2">
          Get your Google reviews in one place
        </h1>

        <form onSubmit={handleSubmit}>
          <input
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            placeholder="Google Place ID"
          />

          <button type="submit" disabled={loading}>
            {loading ? 'Importing…' : 'Import Reviews'}
          </button>

          {error && <p>{error}</p>}
          {success && <p>Success! Redirecting…</p>}
        </form>
      </div>
    </div>
  )
}
