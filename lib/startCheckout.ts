// lib/startCheckout.ts
export async function startCheckout(next: string = "/dashboard") {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ next }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.url) {
    throw new Error(data?.error || "Unable to start checkout.");
  }

  window.location.href = data.url; // redirect to Stripe Checkout
}
