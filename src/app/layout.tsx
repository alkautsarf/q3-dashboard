import type { Metadata } from "next";
import { Share_Tech_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const ST = Share_Tech_Mono({
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Q3 Dashboard",
  description: "Quantum3Labs Challenges Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${ST.className} antialiased bg-white`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}