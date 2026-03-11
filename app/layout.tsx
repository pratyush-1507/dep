import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "HealthScan — Personalized Food Safety",
  description:
    "Scan food products and get instant, personalized health recommendations based on your health profile, allergies, and dietary preferences.",
  keywords: ["health", "food scanner", "nutrition", "barcode", "dietary", "allergies"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable}`}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
