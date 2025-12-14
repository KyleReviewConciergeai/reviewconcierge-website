# Review Concierge AI

Review Concierge is a SaaS product for hospitality operators (restaurants, cafés, bars, wineries, nightclubs, and tour operators) that helps monitor, analyze, and respond to online reviews using AI.

This repository contains:
- The public marketing & waitlist site
- A production-ready waitlist intake API
- Google Sheets integration for lead capture
- Basic bot protection (honeypot + timing)

---

## 🚀 Current Status (Day 1 Complete)

✅ Live landing page deployed on Vercel  
✅ Waitlist form connected to Google Sheets  
✅ Server-side validation and spam protection  
✅ Production environment variables configured  
✅ Ready to collect real leads

---

## 🧱 Tech Stack

- **Frontend:** Next.js (App Router, TypeScript)
- **Hosting:** Vercel
- **Backend:** Next.js API Routes
- **Data (Waitlist):** Google Apps Script → Google Sheets
- **Auth / DB (coming next):** Supabase
- **AI (coming next):** OpenAI / LLM integrations

---

## 📝 Environment Variables

Create a `.env.local` file at the root of the project:

```bash
WAITLIST_WEBHOOK_URL=your_google_apps_script_webhook_url
