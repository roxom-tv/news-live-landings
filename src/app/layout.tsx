import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roxom TV Live Landings",
  description: "Telegram-operated live Roxom TV landing pages."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
