-- Tenant isolation and immutability (spec §8C.7, §11.0).
-- Apply after `prisma migrate`. The application connects as role `app_user`
-- and sets the tenant per transaction:  SET LOCAL app.firm_id = '<uuid>';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Office','User','CountryProfileVersion','FirmRiskAssessment','PolicyDocument',
    'PolicyAcknowledgement','Party','OwnershipLink','Matter','MatterParty','Transaction',
    'CddFile','IdentityVerification','RegistryExtract','ScreeningResult',
    'ClientRiskAssessment','Document','Case','Report','Task','Approval','AuditEvent',
    'EmailDomainVerification'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("firmId" = current_setting(''app.firm_id'', true)::uuid) WITH CHECK ("firmId" = current_setting(''app.firm_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

-- Firm table: a tenant sees only itself.
ALTER TABLE "Firm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Firm" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Firm";
CREATE POLICY tenant_isolation ON "Firm" USING (id = current_setting('app.firm_id', true)::uuid);

-- Audit events and approvals cannot be edited or deleted by anyone, including Owner.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_event_immutable ON "AuditEvent";
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS approval_immutable ON "Approval";
CREATE TRIGGER approval_immutable BEFORE UPDATE OR DELETE ON "Approval"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
