import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getSession } from "@/lib/server/session";
import { getOrCreatePendingTotpSecret } from "@/lib/server/auth/flows";
import { otpauthUri } from "@/lib/auth/totp";
import { EnrollForm } from "./enroll-form";

export default async function MfaSetupPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.stage === "MFA_PENDING") redirect("/login/mfa");
  if (s.stage === "ACTIVE" && s.user.mfaEnrolled) redirect("/app");
  const secret = await getOrCreatePendingTotpSecret(s.user.id);
  const svg = await QRCode.toString(otpauthUri(secret, s.user.email), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Set up two-factor authentication</h1>
        <p className="text-sm text-muted">
          Two-factor authentication is required for every user. Scan the code with an authenticator app (for example Microsoft
          Authenticator, Google Authenticator, 1Password), then enter the 6-digit code it shows.
        </p>
      </div>
      <div className="w-48 rounded bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code for your authenticator app" role="img" />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Can&apos;t scan? Enter this key instead</summary>
        <code className="mt-2 block break-all font-mono">{secret.match(/.{1,4}/g)!.join(" ")}</code>
      </details>
      <EnrollForm />
    </div>
  );
}
