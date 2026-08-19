import type { Metadata } from "next";
import ThemeRegistry from "@/components/ThemeRegistry";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "CCIP — Connectivity Coverage Intelligence Platform",
  description: "Roaming connectivity intelligence for MNOs, IPX providers, and business development teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <AuthProvider>{children}</AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
