import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AccessProvider } from "@/features/access/AccessProvider";

export const metadata: Metadata = {
  title: "Insight",
  description: "TeamOptix Insight platform",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AccessProvider>{props.children}</AccessProvider>
        <Analytics />
      </body>
    </html>
  );
}
