-- Supabase only: the app's tenant role gets table access; Supabase's public API roles get none
-- (the app never uses the Supabase Data API).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE aml_owner IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  END IF;
END $$;
