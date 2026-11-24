import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Security and responsible disclosure · AMLSync App", description: "How AMLSync App protects your firm's data, and how to report a security issue responsibly." };

export default function SecurityPage() {
  return (
    <div className="max-w-2xl space-y-4 text-sm">
      <h1 className="text-2xl font-semibold">Security and responsible disclosure</h1>
      <p>AMLSync App holds sensitive data for the firms that use it. If you find a vulnerability, please tell us at <a className="text-accent underline" href="mailto:security@amlsync.com">security@amlsync.com</a>.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Give us reasonable time to fix the issue before you disclose it.</li>
        <li>Don&apos;t access, change or delete data that isn&apos;t yours; use your own test account.</li>
        <li>No denial-of-service testing, social engineering or physical attacks.</li>
        <li>We won&apos;t take legal action against good-faith research that follows these rules, and we&apos;ll credit you if you wish.</li>
      </ul>
      <p className="text-muted">Machine-readable contact: <a className="underline" href="/.well-known/security.txt">/.well-known/security.txt</a></p>

      <h2 className="pt-4 text-lg font-semibold" id="subprocessors">Sub-processors and data location</h2>
      <p>The suppliers that process data for AMLSync App, what each one does, what data it handles and where it is stored, are listed on one page. We announce changes before a new supplier starts processing personal data.</p>
      <p><Link href="/subprocessors" className="font-semibold text-accent underline">Sub-processors and data location</Link></p>

      <h2 className="pt-4 text-lg font-semibold">How firms&apos; data is protected</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Data is stored in the EU (Frankfurt). Uploaded documents are encrypted with a separate key for each firm; national ID and tax numbers are encrypted field by field.</li>
        <li>The database itself keeps each firm&apos;s data apart from every other firm&apos;s.</li>
        <li>Two-factor sign-in for every user. Exports need a fresh two-factor check, and the firm&apos;s Owners are told about every export.</li>
        <li>Every action is recorded in an audit trail that nobody can change.</li>
        <li>Encrypted backups every week. Client records are deleted automatically when the legal retention period ends.</li>
      </ul>
    </div>
  );
}
