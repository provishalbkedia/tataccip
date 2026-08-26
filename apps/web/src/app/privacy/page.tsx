import type { Metadata } from "next";
import PrivacyContent from "./PrivacyContent";

export const metadata: Metadata = {
  title: "Privacy Policy — CCIP | Tata Communications",
  description:
    "Privacy Policy for the Connectivity Coverage Intelligence Platform (CCIP), operated by Tata Communications.",
};

export default function PrivacyPolicyPage() {
  return <PrivacyContent />;
}
