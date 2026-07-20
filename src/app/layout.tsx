import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gaming Retreat Portal",
  description: "Plan games, enter the lottery, and build your retreat schedule.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
