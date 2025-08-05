-- File: supabase/00_init_schema.sql
-- Description: Initializes the database schema for the Notion Timer application.

-- 1. CREATE THE tasks TABLE
-- This table stores the state and timing information for each tracked Notion page.
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_page_id text NOT NULL UNIQUE,
  duration_sec integer NOT NULL,
  state text NOT NULL DEFAULT 'Not started' CHECK (state IN ('Not started', 'Working', 'Paused', 'Completed')),
  last_resumed_at timestamptz NULL,
  elapsed_sec integer NOT NULL DEFAULT 0,
  cover_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- COMMENT ON TABLE
COMMENT ON TABLE public.tasks IS 'Stores state for Notion page timers.';

-- 2. CREATE A TRIGGER TO AUTOMATICALLY UPDATE `updated_at`
-- This is a good practice to know when a row was last touched.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_tasks_update
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

-- 3. ENABLE ROW-LEVEL SECURITY (RLS)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- For a personal project, a simple "allow all" policy for the service role is sufficient.
CREATE POLICY "Allow all access for service role"
ON public.tasks FOR ALL
USING (true)
WITH CHECK (true);

-- 4. SETUP STORAGE BUCKET FOR COVERS
-- Creates a publicly readable bucket to store the generated cover images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('task_covers', 'task_covers', true)
ON CONFLICT (id) DO NOTHING;
