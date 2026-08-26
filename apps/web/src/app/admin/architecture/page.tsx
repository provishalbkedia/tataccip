"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Link as MuiLink,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import RequireAuth from "@/components/RequireAuth";
import AppShell from "@/components/AppShell";
import { Role } from "@ccip/shared-types";

function SectionHead({ num, title }: { num: string; title: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, borderBottom: "2px solid", borderColor: "divider", pb: 1.2, mb: 2.5 }}>
      <Box
        component="span"
        sx={{
          fontFamily: "monospace",
          fontSize: 14,
          fontWeight: 700,
          color: "secondary.main",
          bgcolor: "secondary.light",
          opacity: 0.9,
          borderRadius: 1,
          px: 1,
          py: 0.2,
        }}
      >
        {num}
      </Box>
      <Typography variant="h6" fontWeight={700}>
        {title}
      </Typography>
    </Box>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 3.5, mb: 1.5, pl: 1.5, borderLeft: "3px solid", borderColor: "secondary.main" }}>
      {children}
    </Typography>
  );
}

function DiagramFrame({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <Box component="figure" className="arch-section" sx={{ m: "20px 0 8px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2.5, boxShadow: 1 }}>
      <Box sx={{ overflowX: "auto" }}>{children}</Box>
      <Typography
        component="figcaption"
        variant="caption"
        color="text.secondary"
        sx={{ mt: 1.75, display: "block", borderTop: "1px dashed", borderColor: "divider", pt: 1.25 }}
      >
        {caption}
      </Typography>
    </Box>
  );
}

function KvTable({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: 1 }}>
      <Table size="small">
        <TableBody>
          {rows.map(([k, v]) => (
            <TableRow key={k}>
              <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap", bgcolor: "action.hover", width: 260 }}>{k}</TableCell>
              <TableCell>{v}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function SystemArchitectureDiagram() {
  return (
    <svg viewBox="0 0 880 470" role="img" aria-label="CCIP system architecture: the browser loads the Next.js app from Vercel over HTTPS, calls the NestJS API on Google Cloud Run with a bearer JWT, and opens a Microsoft Entra ID sign-in popup directly; the Cloud Run backend independently verifies Entra ID tokens against Microsoft's JWKS endpoint and reads and writes data to a Postgres database on Supabase over TLS." style={{ display: "block", margin: "0 auto", maxWidth: "100%", height: "auto", color: "#5A6B7B" }}>
      <defs>
        <marker id="arrow-hld" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>

      <g fontFamily="inherit">
        <rect x="40" y="30" width="210" height="66" rx="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <text x="145" y="58" textAnchor="middle" fontSize="14" fill="#0A2540" fontWeight={600}>User&#8217;s Browser</text>
        <text x="145" y="78" textAnchor="middle" fontSize="11.5" fill="#5A6B7B">CCIP web app (client)</text>

        <rect x="630" y="30" width="210" height="66" rx="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="4 3" />
        <text x="735" y="58" textAnchor="middle" fontSize="14" fill="#0A2540" fontWeight={600}>Microsoft Entra ID</text>
        <text x="735" y="78" textAnchor="middle" fontSize="11.5" fill="#5A6B7B">external identity provider</text>

        <rect x="40" y="200" width="210" height="66" rx="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <text x="145" y="228" textAnchor="middle" fontSize="14" fill="#0A2540" fontWeight={600}>Vercel</text>
        <text x="145" y="248" textAnchor="middle" fontSize="11.5" fill="#5A6B7B">Next.js 14 frontend</text>

        <rect x="335" y="200" width="210" height="66" rx="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <text x="440" y="228" textAnchor="middle" fontSize="14" fill="#0A2540" fontWeight={600}>Google Cloud Run</text>
        <text x="440" y="248" textAnchor="middle" fontSize="11.5" fill="#5A6B7B">NestJS API &middot; asia-south1</text>

        <rect x="335" y="374" width="210" height="66" rx="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <text x="440" y="402" textAnchor="middle" fontSize="14" fill="#0A2540" fontWeight={600}>Supabase</text>
        <text x="440" y="422" textAnchor="middle" fontSize="11.5" fill="#5A6B7B">Postgres + file storage</text>
      </g>

      <g stroke="currentColor" strokeWidth="1.5" fill="none">
        <line x1="145" y1="96" x2="145" y2="200" markerEnd="url(#arrow-hld)" />
        <line x1="248" y1="90" x2="440" y2="200" markerEnd="url(#arrow-hld)" />
        <line x1="250" y1="63" x2="630" y2="63" markerEnd="url(#arrow-hld)" markerStart="url(#arrow-hld)" stroke="#0B6FBF" />
        <line x1="500" y1="200" x2="700" y2="96" markerEnd="url(#arrow-hld)" strokeDasharray="5 4" />
        <line x1="440" y1="266" x2="440" y2="374" markerEnd="url(#arrow-hld)" markerStart="url(#arrow-hld)" />
      </g>

      <g fontFamily="monospace" fontSize="11" fill="#16233A">
        <text x="152" y="150">1 &middot; serves app</text>
        <text x="152" y="163">HTTPS</text>

        <text x="330" y="130" textAnchor="end">2 &middot; REST API calls</text>
        <text x="330" y="143" textAnchor="end">Bearer JWT &middot; HTTPS</text>

        <text x="440" y="48" textAnchor="middle">3 &middot; SSO sign-in popup</text>
        <text x="440" y="61" textAnchor="middle">OpenID Connect</text>

        <text x="612" y="160" textAnchor="middle">4 &middot; verifies ID token</text>
        <text x="612" y="173" textAnchor="middle">JWKS fetch &middot; HTTPS</text>

        <text x="452" y="325">5 &middot; Prisma ORM</text>
        <text x="452" y="338">Postgres wire protocol &middot; TLS</text>
      </g>
    </svg>
  );
}

function SequenceDiagram() {
  return (
    <svg viewBox="0 0 900 660" role="img" aria-label="Sequence diagram: user clicks sign in with Microsoft; the browser's MSAL library opens a popup to Microsoft Entra ID, where the user authenticates directly with Microsoft and a signed ID token is returned to the browser; the browser sends that raw ID token to the CCIP backend; the backend fetches Microsoft's public signing keys, verifies the token's signature, issuer, audience and that the email ends in tatacommunications.com; it then finds or creates the matching user in the CCIP database with a default Viewer role, and finally issues its own 24 hour CCIP session token back to the browser." style={{ display: "block", margin: "0 auto", maxWidth: "100%", height: "auto", color: "#5A6B7B" }}>
      <defs>
        <marker id="arrow-lld" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>

      <g fontFamily="inherit" fontSize="12.5" fill="#0A2540" textAnchor="middle">
        <rect x="20" y="14" width="120" height="40" rx="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <text x="80" y="38">User</text>

        <rect x="190" y="14" width="150" height="40" rx="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <text x="265" y="32">Browser</text>
        <text x="265" y="47" fontSize="10" fill="#5A6B7B" fontFamily="monospace">MSAL.js</text>

        <rect x="390" y="14" width="150" height="40" rx="8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 3" />
        <text x="465" y="38">Microsoft Entra ID</text>

        <rect x="590" y="14" width="150" height="40" rx="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <text x="665" y="32">CCIP Backend</text>
        <text x="665" y="47" fontSize="10" fill="#5A6B7B" fontFamily="monospace">NestJS &middot; Cloud Run</text>

        <rect x="790" y="14" width="90" height="40" rx="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <text x="835" y="38">Database</text>
      </g>

      <g stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" opacity={0.55}>
        <line x1="80" y1="54" x2="80" y2="630" />
        <line x1="265" y1="54" x2="265" y2="630" />
        <line x1="465" y1="54" x2="465" y2="630" />
        <line x1="665" y1="54" x2="665" y2="630" />
        <line x1="835" y1="54" x2="835" y2="630" />
      </g>

      <g fontFamily="monospace" fontSize="11.5" fill="#16233A">
        <line x1="80" y1="96" x2="257" y2="96" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#arrow-lld)" />
        <text x="85" y="88">1 &middot; clicks &#8220;Sign in with Microsoft&#8221;</text>

        <line x1="273" y1="140" x2="457" y2="140" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#arrow-lld)" />
        <text x="278" y="126">2 &middot; loginPopup()</text>
        <text x="278" y="140">scopes: openid, profile, email</text>

        <path d="M465,182 C 545,182 545,224 465,224" fill="none" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#arrow-lld)" />
        <text x="480" y="176">3 &middot; user authenticates directly</text>
        <text x="480" y="190">with Microsoft &mdash; password never</text>
        <text x="480" y="204">reaches CCIP</text>

        <line x1="457" y1="256" x2="273" y2="256" stroke="#0B6FBF" strokeWidth="1.4" markerEnd="url(#arrow-lld)" />
        <text x="278" y="242">4 &middot; signed ID token (JWT)</text>

        <line x1="265" y1="300" x2="657" y2="300" stroke="#0B6FBF" strokeWidth="1.4" markerEnd="url(#arrow-lld)" />
        <text x="278" y="286">5 &middot; POST /auth/microsoft &#123; idToken &#125;</text>

        <line x1="657" y1="344" x2="473" y2="344" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#arrow-lld)" />
        <text x="480" y="330">6 &middot; fetch JWKS (cached, auto-rotated)</text>

        <line x1="465" y1="388" x2="649" y2="388" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#arrow-lld)" />
        <text x="480" y="374">7 &middot; Microsoft public signing keys</text>

        <path d="M665,406 h 90 v 30 h -90" fill="none" stroke="currentColor" strokeWidth="1.2" markerEnd="url(#arrow-lld)" />
        <text x="672" y="454">8 &middot; verify signature, issuer,</text>
        <text x="672" y="468">audience &amp; email domain</text>

        <line x1="665" y1="500" x2="827" y2="500" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#arrow-lld)" />
        <text x="678" y="486">9 &middot; find/create user (VIEWER)</text>

        <line x1="827" y1="544" x2="673" y2="544" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#arrow-lld)" />
        <text x="680" y="530">10 &middot; user record (id, role)</text>

        <line x1="657" y1="588" x2="273" y2="588" stroke="#0B6FBF" strokeWidth="1.6" markerEnd="url(#arrow-lld)" />
        <text x="278" y="574">11 &middot; CCIP session JWT &middot; 24h, sliding refresh</text>
      </g>
    </svg>
  );
}

export default function ArchitectureReferencePage() {
  return (
    <RequireAuth roles={[Role.ADMIN]}>
      <AppShell>
        {/* Print-only styling, same approach as the Help page's "Download
           Platform Guide (PDF)": native browser print-to-PDF gives real,
           selectable text and clean pagination for a text-heavy document
           like this, at zero added bundle weight (no jsPDF/html2canvas). */}
        <style>{`
          @media print {
            .MuiDrawer-root, .MuiAppBar-root, .no-print { display: none !important; }
            main { padding: 0 !important; }
            .arch-section { break-inside: avoid; page-break-inside: avoid; }
          }
        `}</style>

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2, mb: 0.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <LockIcon color="secondary" fontSize="small" />
            <Typography variant="overline" color="text.secondary" fontWeight={700} letterSpacing={1}>
              Admin Reference &middot; Not visible to other roles
            </Typography>
          </Box>
          <Button
            className="no-print"
            variant="contained"
            startIcon={<PictureAsPdfIcon />}
            onClick={() => window.print()}
          >
            Download PDF
          </Button>
        </Box>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
          Microsoft Entra ID Single Sign-On &mdash; HLD &amp; LLD
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 760 }}>
          High-level and low-level design of the Connectivity Coverage Intelligence Platform, prepared to support
          the Tata Communications IT Security review of the Microsoft OAuth (Entra ID) integration request.
        </Typography>

        <Card sx={{ mb: 4 }}>
          <CardContent sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" }, gap: 2 }}>
            {[
              ["System", "CCIP — Connectivity Coverage Intelligence Platform"],
              ["Document type", "HLD & LLD"],
              ["Prepared for", "Tata Communications IT Security"],
              ["Related contact", "Tata Communications Security Team"],
              ["Status", "Pending Azure AD app registration"],
              ["Version", "1.0 — 26 Aug 2026"],
            ].map(([k, v]) => (
              <Box key={k}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>
                  {k}
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {v}
                </Typography>
              </Box>
            ))}
          </CardContent>
        </Card>

        {/* 1. Executive Summary */}
        <Box component="section" sx={{ mb: 5 }}>
          <SectionHead num="1" title="Executive Summary" />
          <Typography variant="body2" sx={{ mb: 1.5, maxWidth: "72ch" }}>
            CCIP is an internal Tata Communications application used by business-development and operations teams
            to cross-reference GSMA IR.21 roaming declarations against wholesale carrier reach lists. It is
            currently reachable only via local email/password accounts created and managed by a platform
            administrator.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1.5, maxWidth: "72ch" }}>
            To let Tata Communications staff sign in with their existing corporate identity instead of a separate
            CCIP-only password, the application has been built to support <strong>Microsoft Entra ID single
            sign-on</strong> via the standard OpenID Connect authorization-code-via-popup flow, restricted to{" "}
            <code>@tatacommunications.com</code> accounts. The integration is fully implemented and deployed in
            code; it is inactive in production only because it requires an <strong>Azure AD App Registration</strong>{" "}
            — the subject of this request.
          </Typography>
          <Typography variant="body2" sx={{ maxWidth: "72ch" }}>
            This document gives the IT Security team everything needed to review and approve that registration:
            the platform&apos;s overall architecture (§2), the exact authentication sequence and security controls
            used to verify a Microsoft-issued token (§3), and the specific App Registration fields to configure
            (§3.5).
          </Typography>
        </Box>

        {/* 2. HLD */}
        <Box component="section" sx={{ mb: 5 }}>
          <SectionHead num="2" title="High-Level Design" />

          <SubHead>2.1 System Architecture</SubHead>
          <Typography variant="body2" sx={{ mb: 1, maxWidth: "72ch" }}>
            CCIP is a four-tier web application: a browser-based single-page app, a stateless REST API, a managed
            relational database, and — for the SSO path — Microsoft&apos;s own identity platform as an external
            trust anchor. No component other than the browser and Microsoft Entra ID ever sees a user&apos;s
            corporate password.
          </Typography>
          <DiagramFrame caption="Fig. 1 — CCIP's four hosted components. The Microsoft sign-in popup (edge 3) and the backend's independent token verification (edge 4) are two separate hops — the browser never has to be trusted to have verified the token itself.">
            <SystemArchitectureDiagram />
          </DiagramFrame>

          <SubHead>2.2 Component Responsibilities</SubHead>
          <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Component</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Responsibility</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  ["Browser (client)", "Renders the UI, holds the CCIP session token in local storage, opens the Microsoft sign-in popup via MSAL.js. Never stores a password."],
                  ["Vercel — Next.js frontend", "Serves the static/SSR web application. Stateless; holds no credentials or secrets."],
                  ["Cloud Run — NestJS API", "All business logic, authentication (local + Microsoft), role-based access control, and the only component that talks to the database."],
                  ["Supabase — Postgres", "System of record for users, roles, uploaded network data, and login history. Also hosts uploaded IR.21 PDF storage."],
                  ["Microsoft Entra ID", "Authenticates the user's corporate identity and issues a signed ID token. CCIP trusts Entra ID's signature, nothing else."],
                ].map(([c, r]) => (
                  <TableRow key={c}>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{c}</TableCell>
                    <TableCell>{r}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <SubHead>2.3 Technology Stack</SubHead>
          <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Layer</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Technology</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  ["Frontend", "Next.js 14 (App Router) · React · TypeScript · MUI"],
                  ["Backend", "NestJS · TypeScript · Prisma ORM"],
                  ["Database", "PostgreSQL (Supabase managed, AWS ap-south-1)"],
                  ["Local authentication", "bcrypt password hashing · signed JWT sessions"],
                  ["SSO authentication", "OpenID Connect (Microsoft Entra ID) · @azure/msal-browser · jose (JWKS verification)"],
                  ["Frontend hosting", "Vercel"],
                  ["Backend hosting", "Google Cloud Run — asia-south1 (Mumbai)"],
                  ["CI/CD", "GitHub → auto-deploy on push to main"],
                ].map(([l, t]) => (
                  <TableRow key={l}>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{l}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 13, color: "secondary.main" }}>{t}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* 3. LLD */}
        <Box component="section" sx={{ mb: 5 }}>
          <SectionHead num="3" title="Low-Level Design — Microsoft OAuth Integration" />

          <SubHead>3.1 Authentication Flow Overview</SubHead>
          <Typography variant="body2" sx={{ mb: 1, maxWidth: "72ch" }}>
            CCIP supports two independent sign-in paths that converge on the same session mechanism:
          </Typography>
          <Box component="ul" sx={{ pl: 3, maxWidth: "72ch" }}>
            <Typography component="li" variant="body2" sx={{ mb: 1 }}>
              <strong>Local:</strong> email + password, verified against a bcrypt hash stored in CCIP&apos;s own database.
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1 }}>
              <strong>Microsoft SSO (this request):</strong> the browser obtains a signed <em>ID token</em> from
              Microsoft Entra ID via a client-side popup; CCIP&apos;s backend independently re-verifies that
              token&apos;s signature, issuer, audience, and email domain before trusting any claim in it, then
              auto-provisions or looks up the matching CCIP user.
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ maxWidth: "72ch" }}>
            Both paths end the same way: the backend issues its own short-lived CCIP session JWT, which is what
            the frontend actually uses for every subsequent API call. Microsoft&apos;s token is used once, at
            sign-in, and is never stored.
          </Typography>

          <SubHead>3.2 Microsoft Sign-In Sequence</SubHead>
          <DiagramFrame caption="Fig. 2 — Steps 6–8 are the trust boundary: CCIP never accepts the token's own claims until it has independently re-verified the cryptographic signature against Microsoft's current keys.">
            <SequenceDiagram />
          </DiagramFrame>

          <SubHead>3.3 Security Controls</SubHead>
          <Alert severity="info" icon={false} sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>No client secret is stored anywhere.</strong> CCIP registers as a public client (SPA) and
              trusts Microsoft only via cryptographic signature verification of the ID token — the standard,
              secret-free pattern for browser-based apps.
            </Typography>
          </Alert>
          <Box component="ul" sx={{ pl: 3, maxWidth: "72ch" }}>
            {[
              <>
                <strong>Signature verification.</strong> Every ID token is checked against Microsoft&apos;s own
                published signing keys (JWKS), fetched live and cached with automatic key rotation handling — via
                the <code>jose</code> library.
              </>,
              <>
                <strong>Issuer validation.</strong> The token&apos;s <code>iss</code> claim must match{" "}
                <code>https://login.microsoftonline.com/&#123;tenant-guid&#125;/v2.0</code> for a genuine Microsoft
                Entra tenant.
              </>,
              <>
                <strong>Audience validation.</strong> The token&apos;s <code>aud</code> claim must equal the
                registered Application (client) ID — rejects tokens issued for a different app.
              </>,
              <>
                <strong>Domain allowlist, enforced server-side.</strong> The verified email claim must end in{" "}
                <code>@tatacommunications.com</code>; this check happens in the backend, not just the UI, so it
                cannot be bypassed by calling the API directly.
              </>,
              <>
                <strong>Least-privilege auto-provisioning.</strong> A first-time SSO sign-in creates a CCIP
                account with the <code>VIEWER</code> role by default — an administrator must explicitly elevate
                access.
              </>,
              <>
                <strong>Real-time revocation.</strong> Every authenticated request re-checks the user&apos;s
                active/inactive status and current role directly from the database — deactivating an account
                takes effect on that user&apos;s very next request, not at token expiry.
              </>,
            ].map((body, i) => (
              <Typography component="li" variant="body2" key={i} sx={{ mb: 1 }}>
                {body}
              </Typography>
            ))}
          </Box>

          <SubHead>3.4 Token Lifecycle &amp; Session Management</SubHead>
          <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, boxShadow: 1, mb: 1.5 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Token</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Lifetime</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Storage</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Renewal</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Microsoft ID token</TableCell>
                  <TableCell>Single use</TableCell>
                  <TableCell>Never persisted — used once, in memory, at sign-in</TableCell>
                  <TableCell>N/A</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>CCIP session JWT</TableCell>
                  <TableCell>24 hours</TableCell>
                  <TableCell>Browser local storage</TableCell>
                  <TableCell>
                    Silently re-issued every 30 minutes while a tab stays open (<code>POST /auth/refresh</code>,
                    requires a still-valid token)
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary">
            A 401 response from any API call (expired or invalidated token) clears the stored session and returns
            the user to the sign-in page.
          </Typography>

          <SubHead>3.5 Azure AD App Registration — Action Required</SubHead>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>What we need back.</strong> Register the application below in the Tata Communications Azure
              AD tenant and return the <strong>Application (client) ID</strong> to the CCIP engineering team. No
              client secret is required.
            </Typography>
          </Alert>
          <KvTable
            rows={[
              ["Application name", "CCIP — Connectivity Coverage Intelligence Platform"],
              ["Supported account types", "Accounts in this organizational directory only (Tata Communications) — single tenant"],
              ["Platform type", "Single-page application (SPA)"],
              ["Redirect URI (production)", <code key="a">https://tataccip-web-liard.vercel.app</code>],
              ["Redirect URI (local development)", <>
                <code>http://localhost:3000</code> <Typography component="span" variant="caption" color="text.secondary">— optional</Typography>
              </>],
              ["API permissions", <>Microsoft Graph — <code>openid</code>, <code>profile</code>, <code>email</code> (delegated)</>],
              ["Admin consent required?", <Chip key="b" label="No" size="small" variant="outlined" />],
              ["Client secret required?", <Chip key="c" label="No" size="small" variant="outlined" />],
              ["ID token version", <code key="d">v2.0</code>],
              ["Return to app team", <strong key="e">Application (client) ID</strong>],
            ]}
          />
        </Box>

        {/* 4. Data Security */}
        <Box component="section" sx={{ mb: 5 }}>
          <SectionHead num="4" title="Data Security & Compliance" />
          <Box component="ul" sx={{ pl: 3, maxWidth: "72ch" }}>
            <Typography component="li" variant="body2" sx={{ mb: 1 }}>
              <strong>Encryption in transit.</strong> Every hop — browser↔Vercel, browser↔Cloud Run, Cloud
              Run↔Supabase, and both legs to Microsoft Entra ID — runs over HTTPS/TLS.
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1 }}>
              <strong>Role-based access control.</strong> Three roles (Admin, Analyst, Viewer) are enforced on
              every backend endpoint, independent of sign-in method.
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 1 }}>
              <strong>No advertising or tracking.</strong> CCIP serves no ads and sets no third-party tracking
              cookies; full detail is published at{" "}
              <MuiLink href="/privacy" target="_blank" rel="noopener">
                /privacy
              </MuiLink>
              .
            </Typography>
            <Typography component="li" variant="body2">
              <strong>Data residency.</strong> Application backend and database both run in the Mumbai region
              (Cloud Run <code>asia-south1</code>; Supabase Postgres on AWS <code>ap-south-1</code>).
            </Typography>
          </Box>
        </Box>

        {/* 5. Appendix */}
        <Box component="section" sx={{ mb: 2 }}>
          <SectionHead num="5" title="Appendix — Configuration Reference" />
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
            Environment variable names referenced by this integration (values are secrets and are not reproduced
            here).
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 20px", maxWidth: 720 }}>
            {[
              ["MICROSOFT_CLIENT_ID", "Backend — Application (client) ID, used to validate the token's audience."],
              ["NEXT_PUBLIC_MICROSOFT_CLIENT_ID", "Frontend — same Client ID, used by MSAL.js to start the sign-in popup."],
              ["ALLOWED_EMAIL_DOMAIN", <>Domain allowlist enforced server-side — <code>tatacommunications.com</code></>],
              ["DEFAULT_SSO_ROLE", <>Role assigned on first SSO sign-in — <code>VIEWER</code></>],
              ["JWT_EXPIRES_IN", <>CCIP session token lifetime — <code>24h</code></>],
            ].map(([k, v]) => (
              <React.Fragment key={k as string}>
                <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 13, color: "secondary.main" }}>
                  {k}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {v}
                </Typography>
              </React.Fragment>
            ))}
          </Box>
        </Box>

        <Divider sx={{ mb: 2 }} />
        <Typography variant="caption" color="text.secondary" display="block">
          CCIP · Tata Communications · Prepared for IT Security review
        </Typography>
      </AppShell>
    </RequireAuth>
  );
}
