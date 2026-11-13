import type { Metadata } from "next";

export const metadata: Metadata = { title: "Security and responsible disclosure · AMLSyncAI" };

export default function SecurityPage() {
  return (
    <div className="max-w-2xl space-y-4 text-sm">
      <h1 className="text-2xl font-semibold">Security and responsible disclosure</h1>
      <p>AMLSyncAI holds sensitive data for the firms that use it. If you find a vulnerability, please tell us at <a className="text-accent underline" href="mailto:security@amlsyncai.eu">security@amlsyncai.eu</a>.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Give us reasonable time to fix the issue before you disclose it.</li>
        <li>Don&apos;t access, change or delete data that isn&apos;t yours; use your own test account.</li>
        <li>No denial-of-service testing, social engineering or physical attacks.</li>
        <li>We won&apos;t take legal action against good-faith research that follows these rules, and we&apos;ll credit you if you wish.</li>
      </ul>
      <p className="text-muted">Machine-readable contact: <a className="underline" href="/.well-known/security.txt">/.well-known/security.txt</a></p>
    </div>
  );
}
