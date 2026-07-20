CREATE TABLE public.lead_search_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  filters_hash TEXT NOT NULL,
  filters JSONB NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_search_cache_user_hash_idx ON public.lead_search_cache (user_id, filters_hash, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_search_cache TO authenticated;
GRANT ALL ON public.lead_search_cache TO service_role;
ALTER TABLE public.lead_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cache" ON public.lead_search_cache FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.lead_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  empresa TEXT NOT NULL,
  empresa_norm TEXT NOT NULL,
  uf TEXT,
  segmento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, empresa_norm)
);
CREATE INDEX lead_history_user_idx ON public.lead_history (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_history TO authenticated;
GRANT ALL ON public.lead_history TO service_role;
ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own history" ON public.lead_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.lead_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  empresa TEXT NOT NULL,
  empresa_norm TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('good','bad')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, empresa_norm)
);
CREATE INDEX lead_feedback_user_idx ON public.lead_feedback (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_feedback TO authenticated;
GRANT ALL ON public.lead_feedback TO service_role;
ALTER TABLE public.lead_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feedback" ON public.lead_feedback FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.intelligence_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  report jsonb NOT NULL,
  source_lead_empresa text,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intelligence_reports TO authenticated;
GRANT ALL ON public.intelligence_reports TO service_role;
ALTER TABLE public.intelligence_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own intelligence reports" ON public.intelligence_reports FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX intelligence_reports_user_created_idx ON public.intelligence_reports (user_id, created_at DESC);
CREATE INDEX intelligence_reports_user_company_idx ON public.intelligence_reports (user_id, lower(company_name));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_intelligence_reports_updated_at
  BEFORE UPDATE ON public.intelligence_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();