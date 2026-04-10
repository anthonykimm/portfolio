import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

// One font, one job. JetBrains Mono carries the entire interface — display,
// body, prompt, code. Loaded with a few weights so headings can lean into the
// boldness without faking it.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "anthony@portfolio:~$",
  description:
    "Anthony Kim — Software Engineer. An interactive terminal portfolio. Type 'help' to get started.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
