import type { Metadata } from "next";

import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Business operations",
    template: "%s · Business operations",
  },
  description: "A secure, modern business operations workspace.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider><PwaRegistration />{children}</ThemeProvider>
      </body>
    </html>
  );
}
