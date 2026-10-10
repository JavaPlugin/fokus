-- Row Level Security für Vorkommen wiederkehrender Aufgaben (wie 0001_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON task_occurrence TO fokus_app;
--> statement-breakpoint
ALTER TABLE task_occurrence ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE task_occurrence FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY own_rows ON task_occurrence
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
