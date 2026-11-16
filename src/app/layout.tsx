import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-coin", subsets: ["latin"] });
// Small labels and live counters.
const mono = JetBrains_Mono({ variable: "--font-coin-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Coin",
  description: "An AI money agent on made-up data. Code, not the model, decides what can execute.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
