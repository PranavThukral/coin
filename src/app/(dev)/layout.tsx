import { notFound } from "next/navigation";

/** Pages in this group are for building Coin. Anywhere but `next dev` they are a 404. */
export default function DevOnlyLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return children;
}
