-- Tenant isolation and immutability (spec §8C.7, §11.0).
-- Apply after `prisma migrate` (idempotent). The application's tenant queries
-- connect as a non-superuser role (DATABASE_APP_URL) and set the tenant per
-- transaction:  SELECT set_config('app.firm_id', '<uuid>', true);
-- Authentication and system jobs use the owner connection (DATABASE_URL).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Office','User','CountryProfileVersion','FirmRiskAssessment','PolicyDocument',
    'PolicyAcknowledgement','Party','OwnershipLink','Matter','MatterParty','Transaction',
    'CddFile','IdentityVerification','RegistryExtract','ScreeningResult',
    'ClientRiskAssessment','Document','Case','Report','Task','Approval','AuditEvent',
    'EmailDomainVerification','Invitation'
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
-- Exception: approvals about client records are deleted together with those
-- records at the end of the retention period. The retention job sets
-- app.retention_purge = 'on' for its own transaction only. Audit events hold
-- no identifiable data and are never deleted.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'Approval'
     AND current_setting('app.retention_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_event_immutable ON "AuditEvent";
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS approval_immutable ON "Approval";
CREATE TRIGGER approval_immutable BEFORE UPDATE OR DELETE ON "Approval"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Screening lists: official lists (firmId NULL) are shared read-only; firm-uploaded
-- lists are visible only to that firm. Official lists are loaded by the owner connection.
ALTER TABLE "ScreeningList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScreeningList" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON "ScreeningList";
DROP POLICY IF EXISTS tenant_write ON "ScreeningList";
CREATE POLICY tenant_read ON "ScreeningList" FOR SELECT
  USING ("firmId" IS NULL OR "firmId" = current_setting('app.firm_id', true)::uuid);
CREATE POLICY tenant_write ON "ScreeningList" FOR ALL
  USING ("firmId" = current_setting('app.firm_id', true)::uuid)
  WITH CHECK ("firmId" = current_setting('app.firm_id', true)::uuid);

ALTER TABLE "ScreeningEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScreeningEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON "ScreeningEntry";
DROP POLICY IF EXISTS tenant_write ON "ScreeningEntry";
CREATE POLICY tenant_read ON "ScreeningEntry" FOR SELECT USING (EXISTS (
  SELECT 1 FROM "ScreeningList" l WHERE l.id = "listId"
    AND (l."firmId" IS NULL OR l."firmId" = current_setting('app.firm_id', true)::uuid)));
CREATE POLICY tenant_write ON "ScreeningEntry" FOR ALL USING (EXISTS (
  SELECT 1 FROM "ScreeningList" l WHERE l.id = "listId" AND l."firmId" = current_setting('app.firm_id', true)::uuid))
  WITH CHECK (EXISTS (
  SELECT 1 FROM "ScreeningList" l WHERE l.id = "listId" AND l."firmId" = current_setting('app.firm_id', true)::uuid));
