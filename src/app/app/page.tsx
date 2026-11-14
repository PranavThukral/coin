import type { Metadata } from "next";
import { LiveApp } from "../../components/app-shell";

export const metadata: Metadata = { title: "Coin, live" };

export default function LivePage() {
  return <LiveApp />;
}
