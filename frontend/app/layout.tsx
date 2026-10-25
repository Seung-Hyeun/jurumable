import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SETTINGS_SCRIPT } from "@/lib/settings";
import SettingsSync from "./_components/settings-sync";
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
  title: "주루마블",
  description: "친구들과 함께 즐기는 실시간 보드게임",
};

// The inline script sets the theme / animation classes on <html> before the first paint, so
// React finds classes it did not render there: suppressHydrationWarning lets the DOM win.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SETTINGS_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SettingsSync />
        {children}
      </body>
    </html>
  );
}
