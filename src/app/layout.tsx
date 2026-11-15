import type { Metadata } from "next";
import { JetBrains_Mono, Manrope, Newsreader } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-coin", subsets: ["latin"] });
// Headlines are set in a serif, at regular weight: large type carries the page, not heavy type.
const display = Newsreader({ variable: "--font-coin-display", subsets: ["latin"], style: ["normal", "italic"] });
// Small labels and live counters.
const mono = JetBrains_Mono({ variable: "--font-coin-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Coin",
  description: "An AI money agent on made-up data. Code, not the model, decides what can execute.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${display.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
