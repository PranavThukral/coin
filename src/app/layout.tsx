import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-coin", subsets: ["latin"] });
export const metadata: Metadata = { title: "Coin", description: "A clearer view of your money." };
export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en" className={`${manrope.variable} h-full antialiased`}><body className="min-h-full">{children}</body></html>;
}
