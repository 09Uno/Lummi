CREATE TABLE public.hubspot_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  hubspot_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hubspot_integrations TO authenticated;
GRANT ALL ON public.hubspot_integrations TO service_role;
ALTER TABLE public.hubspot_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own hubspot integration" ON public.hubspot_integrations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);