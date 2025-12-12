import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { name, email, units } = await req.json();

    // Basic validation
    if (!email || !units) {
      return NextResponse.json(
        { error: "Email and number of units are required." },
        { status: 400 }
      );
    }

    const webhookUrl = process.env.WAITLIST_WEBHOOK_URL;

    if (!webhookUrl) {
      console.error("WAITLIST_WEBHOOK_URL is not set");
      return NextResponse.json(
        { error: "Server is not configured correctly." },
        { status: 500 }
      );
    }

    // Forward the data to your Google Apps Script webhook
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, units }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Webhook error", res.status, text);
      return NextResponse.json(
        { error: "Failed to save your submission. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Waitlist POST error:", err);
    return NextResponse.json(
      { error: "Unexpected error. Please try again." },
      { status: 500 }
    );
  }
}
