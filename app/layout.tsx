import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Review Concierge AI",
  description:
    "AI-powered review monitoring, response drafting, and reputation management for hospitality operators.",
  openGraph: {
    title: "Review Concierge AI",
    description:
      "Turn online reviews into more bookings and revenue with AI automation.",
    url: "https://reviewconcierge.ai",
    siteName: "Review Concierge AI",
    images: [
      {
        url: "/og-image.png", // 👈 EXACT file name you added to /public
        width: 1200,
        height: 630,
        alt: "Review Concierge AI",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Review Concierge AI",
    description:
      "Turn online reviews into more bookings & revenue with AI automation.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
