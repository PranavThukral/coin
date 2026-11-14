import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-coin", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Coin",
  description: "An AI money agent on made-up data. Code, not the model, decides what can execute.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
