import type { Metadata } from "next";
import "./globals.css";
import { AccessProvider } from "@/features/access/AccessProvider";

export const metadata: Metadata = {
  title: "Insight",
  description: "TeamOptix Insight platform"
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AccessProvider>{props.children}</AccessProvider>
      </body>
    </html>
  );
}
