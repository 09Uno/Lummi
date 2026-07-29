-- =============================================================================
-- RBAC (public.users) + CRM nativo (crm_*)
--
-- ATENÇÃO — schema RECONSTRUÍDO a partir do código da aplicação
-- (src/lib/rbac/types.ts, src/lib/crm/types.ts, src/lib/crm.functions.ts).
-- Estas tabelas foram criadas direto no projeto Supabase pelo Lovable e nunca
-- entraram no controle de versão, então o repositório não conseguia provisionar
-- um ambiente novo. Esta migration fecha essa lacuna.
--
-- É idempotente (IF NOT EXISTS): num banco que já tem as tabelas, os CREATE TABLE
-- viram no-op. As POLICIES, porém, são recriadas (DROP + CREATE) para que o
-- repositório passe a ser a fonte da verdade — revise antes de rodar `db push`
-- num ambiente que já esteja em produção.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Perfis / papéis
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'sdr' CHECK (role IN ('administrador', 'gestor_comercial', 'sdr')),
  manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_manager_idx ON public.users (manager_id);

GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Papel do usuário atual. SECURITY DEFINER para não recursar na RLS de public.users
-- (uma policy em users que consultasse users entraria em loop infinito).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- O usuário atual enxerga dados cujo dono é owner_id?
-- Admin vê tudo; gestor vê a si e aos SDRs sob sua gestão; SDR vê só o próprio.
CREATE OR REPLACE FUNCTION public.can_view_user_data(owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    owner_id = auth.uid()
    OR public.current_user_role() = 'administrador'
    OR (
      public.current_user_role() = 'gestor_comercial'
      AND EXISTS (
        SELECT 1 FROM public.users u WHERE u.id = owner_id AND u.manager_id = auth.uid()
      )
    );
$$;

DROP POLICY IF EXISTS "users read self and team" ON public.users;
CREATE POLICY "users read self and team" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR manager_id = auth.uid()
    OR public.current_user_role() IN ('administrador', 'gestor_comercial')
  );

-- INSERT/DELETE de perfil passam só pelo service_role (src/lib/rbac/admin.functions.ts).
DROP POLICY IF EXISTS "users update by admin" ON public.users;
CREATE POLICY "users update by admin" ON public.users
  FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('administrador', 'gestor_comercial'))
  WITH CHECK (public.current_user_role() IN ('administrador', 'gestor_comercial'));

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- CRM — card do Kanban
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,
  organization_norm TEXT NOT NULL,
  website TEXT,
  email TEXT,
  phone TEXT,
  linkedin TEXT,
  cnpj TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'nurture', 'qualified', 'lost')),
  source TEXT NOT NULL DEFAULT 'prospeccao'
    CHECK (source IN ('prospeccao', 'manual', 'inteligencia', 'import')),
  industry TEXT,
  segment TEXT,
  uf TEXT,
  municipio TEXT,
  fit TEXT,
  confianca TEXT CHECK (confianca IS NULL OR confianca IN ('alta', 'media', 'validar')),
  position INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  converted BOOLEAN NOT NULL DEFAULT false,
  lost_reason TEXT,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_norm)
);
CREATE INDEX IF NOT EXISTS crm_leads_user_status_idx ON public.crm_leads (user_id, status, position);
CREATE INDEX IF NOT EXISTS crm_leads_assigned_idx ON public.crm_leads (assigned_to);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;
GRANT ALL ON public.crm_leads TO service_role;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm leads visibility" ON public.crm_leads;
CREATE POLICY "crm leads visibility" ON public.crm_leads
  FOR ALL TO authenticated
  USING (assigned_to = auth.uid() OR public.can_view_user_data(user_id))
  WITH CHECK (public.can_view_user_data(user_id));

DROP TRIGGER IF EXISTS update_crm_leads_updated_at ON public.crm_leads;
CREATE TRIGGER update_crm_leads_updated_at
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- CRM — histórico de observações (append-only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_lead_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT,
  kind TEXT NOT NULL DEFAULT 'note'
    CHECK (kind IN ('note', 'call', 'email', 'whatsapp', 'meeting')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_lead_notes_lead_idx ON public.crm_lead_notes (lead_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lead_notes TO authenticated;
GRANT ALL ON public.crm_lead_notes TO service_role;
ALTER TABLE public.crm_lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm notes visibility" ON public.crm_lead_notes;
CREATE POLICY "crm notes visibility" ON public.crm_lead_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id
        AND (l.assigned_to = auth.uid() OR public.can_view_user_data(l.user_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id
        AND (l.assigned_to = auth.uid() OR public.can_view_user_data(l.user_id))
    )
  );

-- -----------------------------------------------------------------------------
-- CRM — tarefas do lead
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_lead_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'follow_up'
    CHECK (task_type IN ('follow_up', 'meeting', 'call', 'email', 'other')),
  due_at TIMESTAMPTZ,
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_lead_tasks_lead_idx ON public.crm_lead_tasks (lead_id);
CREATE INDEX IF NOT EXISTS crm_lead_tasks_pending_idx ON public.crm_lead_tasks (user_id, done, due_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lead_tasks TO authenticated;
GRANT ALL ON public.crm_lead_tasks TO service_role;
ALTER TABLE public.crm_lead_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm tasks visibility" ON public.crm_lead_tasks;
CREATE POLICY "crm tasks visibility" ON public.crm_lead_tasks
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.can_view_user_data(user_id))
  WITH CHECK (user_id = auth.uid() OR public.can_view_user_data(user_id));

DROP TRIGGER IF EXISTS update_crm_lead_tasks_updated_at ON public.crm_lead_tasks;
CREATE TRIGGER update_crm_lead_tasks_updated_at
  BEFORE UPDATE ON public.crm_lead_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- CRM — perfil da empresa vindo do enrichment (1:1 com o lead)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_lead_company_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL UNIQUE REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  razao_social TEXT,
  nome_fantasia TEXT,
  cnpj TEXT,
  telefone_fixo TEXT,
  whatsapp TEXT,
  telefone_comercial TEXT,
  sac TEXT,
  email TEXT,
  site TEXT,
  linkedin TEXT,
  cidade TEXT,
  estado TEXT,
  segmento TEXT,
  porte TEXT,
  cnae TEXT,
  cnae_descricao TEXT,
  fonte_enriquecimento TEXT,
  contatos_origem JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_enrichment JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lead_company_profiles TO authenticated;
GRANT ALL ON public.crm_lead_company_profiles TO service_role;
ALTER TABLE public.crm_lead_company_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm profiles visibility" ON public.crm_lead_company_profiles;
CREATE POLICY "crm profiles visibility" ON public.crm_lead_company_profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id
        AND (l.assigned_to = auth.uid() OR public.can_view_user_data(l.user_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id
        AND (l.assigned_to = auth.uid() OR public.can_view_user_data(l.user_id))
    )
  );

DROP TRIGGER IF EXISTS update_crm_lead_company_profiles_updated_at ON public.crm_lead_company_profiles;
CREATE TRIGGER update_crm_lead_company_profiles_updated_at
  BEFORE UPDATE ON public.crm_lead_company_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- CRM — tomadores de decisão do lead
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_lead_decision_makers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  area TEXT CHECK (
    area IS NULL OR area IN (
      'rh_people', 'financeiro', 'operacoes_industrial', 'marketing',
      'comercial_vendas', 'ti_tecnologia', 'juridico', 'compras_suprimentos',
      'facilities', 'diretoria_executiva', 'socios_fundadores', 'outra'
    )
  ),
  priority INTEGER NOT NULL DEFAULT 99,
  score NUMERIC NOT NULL DEFAULT 0,
  probabilidade_decisor NUMERIC,
  linkedin_url TEXT,
  employment_verified BOOLEAN NOT NULL DEFAULT false,
  source TEXT,
  evidence TEXT,
  commercial_context_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_lead_dm_lead_idx
  ON public.crm_lead_decision_makers (lead_id, priority, score DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lead_decision_makers TO authenticated;
GRANT ALL ON public.crm_lead_decision_makers TO service_role;
ALTER TABLE public.crm_lead_decision_makers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm decision makers visibility" ON public.crm_lead_decision_makers;
CREATE POLICY "crm decision makers visibility" ON public.crm_lead_decision_makers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id
        AND (l.assigned_to = auth.uid() OR public.can_view_user_data(l.user_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id
        AND (l.assigned_to = auth.uid() OR public.can_view_user_data(l.user_id))
    )
  );

DROP TRIGGER IF EXISTS update_crm_lead_dm_updated_at ON public.crm_lead_decision_makers;
CREATE TRIGGER update_crm_lead_dm_updated_at
  BEFORE UPDATE ON public.crm_lead_decision_makers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
