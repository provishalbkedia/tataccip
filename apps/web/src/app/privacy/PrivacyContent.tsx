"use client";

import * as React from "react";
import Link from "next/link";
import { Box, Chip, Container, Divider, Link as MuiLink, Stack, Typography } from "@mui/material";
import CellTowerIcon from "@mui/icons-material/CellTower";

const EFFECTIVE_DATE = "26 August 2026";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Box component="section" id={id} sx={{ mb: 4 }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5, color: "primary.main" }}>
        {title}
      </Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
      {children}
    </Typography>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" component="li" sx={{ lineHeight: 1.8, mb: 0.5 }}>
      {children}
    </Typography>
  );
}

// Intentionally outside AppShell/RequireAuth — a Privacy Policy has to be
// publicly reachable (no login) for third-party review (e.g. a Google Ad
// Manager / API access submission), the same way /login is public.
export default function PrivacyContent() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        sx={{
          background: "linear-gradient(135deg, #0A2540 0%, #0B6FBF 100%)",
          color: "#fff",
          py: { xs: 4, sm: 6 },
          px: 2,
        }}
      >
        <Container maxWidth="md">
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
            <CellTowerIcon fontSize="large" />
            <Typography variant="h4" fontWeight={700}>
              CCIP
            </Typography>
          </Stack>
          <Typography variant="subtitle1" sx={{ opacity: 0.9, mb: 2 }}>
            Connectivity Coverage Intelligence Platform · Tata Communications
          </Typography>
          <Typography variant="h5" fontWeight={700}>
            Privacy Policy
          </Typography>
          <Chip
            label={`Effective ${EFFECTIVE_DATE}`}
            size="small"
            sx={{ mt: 1.5, bgcolor: "rgba(255,255,255,0.15)", color: "#fff" }}
          />
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: { xs: 4, sm: 6 } }}>
        <P>
          This Privacy Policy describes how Tata Communications (&quot;Tata Communications,&quot; &quot;we,&quot;
          &quot;us,&quot; or &quot;our&quot;) collects, uses, and safeguards information in connection with the
          Connectivity Coverage Intelligence Platform (&quot;CCIP,&quot; the &quot;Platform,&quot; or the
          &quot;Service&quot;) — an internal roaming-connectivity intelligence tool used by authorized Tata
          Communications personnel and its business partners to review GSMA IR.21 declarations, wholesale
          carrier reach lists, and related interconnect data. CCIP is not a public consumer product: it does
          not serve advertisements, does not offer public account self-registration, and is not directed at
          children.
        </P>

        <Divider sx={{ my: 4 }} />

        <Section id="information-we-collect" title="1. Information We Collect">
          <P>We collect the following categories of information in the course of operating the Platform:</P>
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            <Bullet>
              <strong>Account information.</strong> Email address, display name, and assigned role (Admin,
              Analyst, or Viewer), provided either directly at account creation or via Microsoft Entra ID
              single sign-on for holders of a corporate @tatacommunications.com account.
            </Bullet>
            <Bullet>
              <strong>Authentication &amp; session data.</strong> A session token used to keep you signed in,
              stored in your browser&apos;s local storage.
            </Bullet>
            <Bullet>
              <strong>Login &amp; activity history.</strong> Timestamps, the requesting IP address, and
              browser/operating-system information for each sign-in, used to show your own recent login
              activity and to power the Platform&apos;s &quot;who else is online&quot; indicator. We cannot see
              which physical device you used — only what your browser reports.
            </Bullet>
            <Bullet>
              <strong>Uploaded network data.</strong> GSMA IR.21 XML/PDF documents and carrier reach-list
              spreadsheets uploaded by administrators. This data describes mobile network operators&apos; and
              wholesale carriers&apos; interconnect declarations — it is business/network configuration data, not
              personal data about individual end users of any mobile network.
            </Bullet>
          </Box>
        </Section>

        <Section id="how-we-use-information" title="2. How We Use Information">
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            <Bullet>To authenticate you and maintain your signed-in session.</Bullet>
            <Bullet>To enforce role-based access control across the Platform&apos;s features.</Bullet>
            <Bullet>
              To display account activity (your own login history, and platform-wide active-user counts) back
              to signed-in users.
            </Bullet>
            <Bullet>
              To operate the Platform&apos;s core function: ingesting, normalizing, and cross-referencing IR.21
              and reach-list connectivity data for internal business-development and operations use.
            </Bullet>
            <Bullet>To maintain the security, integrity, and availability of the Platform.</Bullet>
          </Box>
          <P>
            We do not use your information for advertising, do not build behavioral advertising profiles, and
            do not sell or rent personal information to third parties.
          </P>
        </Section>

        <Section id="cookies-tracking" title="3. Cookies &amp; Tracking Technologies">
          <P>
            CCIP does not use advertising or cross-site tracking cookies. The Platform stores a session
            token in your browser&apos;s local storage solely to keep you signed in; this is not a
            third-party cookie and is not used to track you across other websites.
          </P>
        </Section>

        <Section id="sharing" title="4. How Information Is Shared">
          <P>
            We do not sell personal information. Limited information is shared only with service providers
            that help us operate the Platform, under contractual confidentiality obligations:
          </P>
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            <Bullet>
              <strong>Microsoft (Entra ID)</strong> — for organizational single sign-on authentication, where
              used.
            </Bullet>
            <Bullet>
              <strong>Google Cloud</strong> — hosts the Platform&apos;s backend application services.
            </Bullet>
            <Bullet>
              <strong>Vercel</strong> — hosts the Platform&apos;s web front end.
            </Bullet>
            <Bullet>
              <strong>Supabase</strong> — provides managed database and file-storage infrastructure.
            </Bullet>
          </Box>
          <P>
            We may also disclose information where required by law, to protect the rights and safety of Tata
            Communications and its users, or in connection with a corporate transaction.
          </P>
        </Section>

        <Section id="data-security" title="5. Data Security">
          <P>
            We apply industry-standard technical and organizational safeguards, including encrypted
            connections (HTTPS/TLS) for all traffic, hashed password storage, role-based access control, and
            automatic session revocation when an account is deactivated. No method of transmission or storage
            is completely secure, and we cannot guarantee absolute security.
          </P>
        </Section>

        <Section id="data-retention" title="6. Data Retention">
          <P>
            Account and login-history data is retained for as long as your account remains active on the
            Platform, and for a reasonable period afterward for security and audit purposes. Uploaded network
            data is retained to support the Platform&apos;s ongoing interconnect-intelligence function and is
            superseded by subsequent uploads as new baselines are ingested.
          </P>
        </Section>

        <Section id="your-rights" title="7. Your Rights &amp; Choices">
          <P>
            Depending on your jurisdiction, you may have rights to access, correct, or request deletion of
            your personal information. Because CCIP is an internal-access platform, most such requests are
            handled directly by your Tata Communications account administrator. You may also contact us using
            the details below.
          </P>
        </Section>

        <Section id="childrens-privacy" title="8. Children&apos;s Privacy">
          <P>
            CCIP is an internal business tool intended for use by authorized working professionals only. It is
            not directed at, and we do not knowingly collect information from, children under 16.
          </P>
        </Section>

        <Section id="changes" title="9. Changes to This Policy">
          <P>
            We may update this Privacy Policy from time to time to reflect changes in our practices or for
            legal, operational, or regulatory reasons. The &quot;Effective&quot; date at the top of this page
            indicates when it was last revised.
          </P>
        </Section>

        <Section id="contact" title="10. Contact Us">
          <P>
            If you have questions about this Privacy Policy or how your information is handled, please contact
            your Tata Communications account administrator, or reach the platform team at{" "}
            <MuiLink href="mailto:privacy@tatacommunications.com">privacy@tatacommunications.com</MuiLink>.
          </P>
        </Section>

        <Divider sx={{ my: 4 }} />

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          © {new Date().getFullYear()} Tata Communications Ltd. All rights reserved. This policy applies
          specifically to the Connectivity Coverage Intelligence Platform and does not supersede any other
          Tata Communications privacy notice.
        </Typography>
        <MuiLink component={Link} href="/login" variant="body2">
          ← Back to sign in
        </MuiLink>
      </Container>
    </Box>
  );
}
