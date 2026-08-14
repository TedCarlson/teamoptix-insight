import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AccessProvider } from "@/features/access/AccessProvider";
import { ThemeProvider } from "@/features/theme/ThemeProvider";

const themeBootstrap = `
  (() => {
    let theme = "light";
    try {
      const saved = window.localStorage.getItem("insight-theme");
      if (saved === "dark" || saved === "light") theme = saved;
    } catch {}
    document.documentElement.dataset.theme = theme;
  })();
`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://teamoptix.io"),
  title: {
    default: "Team Optix | Operational software built by operators",
    template: "%s | Team Optix",
  },
  description: "Team Optix builds Insight, the governed operating system connecting people, work, assets, and daily decisions.",
  openGraph: {
    type: "website",
    title: "Team Optix | See the operation. Run it better.",
    description: "Meet Insight, the governed operating system built for real-world execution.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Team Optix — See the operation. Run it better." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Team Optix | See the operation. Run it better.",
    description: "Meet Insight, the governed operating system built for real-world execution.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ThemeProvider>
          <AccessProvider>{props.children}</AccessProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
