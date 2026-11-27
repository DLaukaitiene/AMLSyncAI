/** What the Compliance Officer and the Compliance Manager are for and do: shown behind (?) wherever they're appointed. */
export const ROLE_HELP = {
  "compliance-officer": (
    <>
      <p><strong className="text-foreground">Compliance Officer</strong>: the person who runs AML compliance day to day.</p>
      <p>They put your AML policy and controls into practice and check they work, make sure clients are checked and screened, receive staff&apos;s internal suspicion reports and decide whether to report to the FIU, are the contact point for the FIU and your supervisor, and report to management on how compliance is going.</p>
      <p>They need enough seniority, knowledge and time for the role. In a small firm it is often the owner. Tell your supervisor when the Compliance Officer changes.</p>
    </>
  ),
  "compliance-manager": (
    <>
      <p><strong className="text-foreground">Compliance Manager</strong>: the member of management (owner, partner or director) who answers for AML compliance at the top of the firm.</p>
      <p>They make sure the Compliance Officer has the time, resources and authority to do the job, approve the firm&apos;s risk assessment and AML policy, receive the Compliance Officer&apos;s reports and act on them, and give senior management approval for high-risk and PEP clients.</p>
      <p>In a one-person firm you hold both roles.</p>
    </>
  ),
} as const;
