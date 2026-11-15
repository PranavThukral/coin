import type { Metadata } from "next";
import { DemoApp } from "../../components/app-shell";

export const metadata: Metadata = { title: "Coin, the two-minute demo" };

export default function DemoPage() {
  return <DemoApp />;
}
