import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AccessProvider } from "@/features/access/AccessProvider";
import { ThemeProvider } from "@/features/theme/ThemeProvider";

const themeBootstrap = `
  (() => {
    let preference = "system";
    try {
      const savedPreference = window.localStorage.getItem("insight-theme-preference");
      const legacyTheme = window.localStorage.getItem("insight-theme");
      if (savedPreference === "system" || savedPreference === "dark" || savedPreference === "light") {
        preference = savedPreference;
      } else if (legacyTheme === "dark" || legacyTheme === "light") {
        preference = legacyTheme;
      }
    } catch {}
    const theme = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    document.documentElement.dataset.themePreference = preference;
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
        <AccessProvider>
          <ThemeProvider>{props.children}</ThemeProvider>
        </AccessProvider>
        <Analytics />
      </body>
    </html>
  );
}
