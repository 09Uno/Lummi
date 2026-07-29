/**
 * Admin / Gestor RBAC — listar / criar / atualizar / remover usuários.
 * Admin: qualquer papel. Gestor: apenas SDRs sob sua gestão.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { UserRole } from "@/lib/rbac/types";
import { GOOGLE_ADMIN_EMAIL } from "@/lib/rbac/types";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Cliente Supabase já autenticado, entregue por requireSupabaseAuth no context. */
type AuthedSupabase = SupabaseClient<Database>;

const ROLES = ["administrador", "gestor_comercial", "sdr"] as const;

const CreateUserSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(6).max(128),
  full_name: z.string().min(1).max(200),
  role: z.enum(ROLES),
  manager_id: z.string().uuid().nullable().optional(),
});

const UpdateUserSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1).max(200).optional(),
  role: z.enum(ROLES).optional(),
  manager_id: z.string().uuid().nullable().optional(),
});

const DeleteUserSchema = z.object({
  id: z.string().uuid(),
});

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  manager_id: string | null;
  created_at: string;
  updated_at: string | null;
};

type Profile = { role: UserRole; id: string };

async function getProfile(supabase: AuthedSupabase, userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao verificar permissão: ${error.message}`);
  if (!data) throw new Error("Acesso negado: perfil não encontrado.");
  return data as Profile;
}

async function assertAdmin(supabase: AuthedSupabase, userId: string): Promise<Profile> {
  const profile = await getProfile(supabase, userId);
  if (profile.role !== "administrador") {
    throw new Error("Acesso negado: apenas administradores.");
  }
  return profile;
}

async function assertAdminOrGestor(supabase: AuthedSupabase, userId: string): Promise<Profile> {
  const profile = await getProfile(supabase, userId);
  if (profile.role !== "administrador" && profile.role !== "gestor_comercial") {
    throw new Error("Acesso negado: apenas administradores ou gestores.");
  }
  return profile;
}

/** Bootstrap do admin Google — só jeorx99@gmail.com. */
export const ensureAdminProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { data: authUser } = await supabase.auth.getUser();
    const email = (authUser.user?.email ?? "").trim().toLowerCase();

    if (email !== GOOGLE_ADMIN_EMAIL) {
      throw new Error("Bootstrap permitido apenas para o administrador autorizado.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("users")
      .upsert(
        {
          id: userId,
          email,
          full_name: authUser.user?.user_metadata?.full_name ?? "Administrador",
          role: "administrador",
          manager_id: null,
        } as never,
        { onConflict: "id" },
      )
      .select("id, email, full_name, role, manager_id, created_at, updated_at")
      .single();

    if (error) throw new Error(`Falha no bootstrap admin: ${error.message}`);
    return { user: data as AdminUserRow };
  });

/** Lista usuários: admin vê todos; gestor vê a si + seus SDRs. */
export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const me = await assertAdminOrGestor(supabase, userId);

    let query = supabase
      .from("users")
      .select("id, email, full_name, role, manager_id, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (me.role === "gestor_comercial") {
      query = query.or(`id.eq.${userId},manager_id.eq.${userId}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Falha ao listar usuários: ${error.message}`);
    return { users: (data ?? []) as AdminUserRow[] };
  });

/**
 * Cria usuário em auth.users + public.users.
 * Admin: qualquer papel. Gestor: apenas role sdr, manager_id = si mesmo.
 */
export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const me = await assertAdminOrGestor(supabase, userId);

    const role = data.role;
    let managerId = data.manager_id ?? null;

    if (me.role === "gestor_comercial") {
      if (role !== "sdr") {
        throw new Error("Gestor só pode criar contas SDR.");
      }
      managerId = userId;
    }

    if (role === "administrador") managerId = null;
    if (role === "sdr" && !managerId && me.role === "administrador") {
      managerId = null;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name.trim() },
    });

    if (authError || !created.user) {
      throw new Error(authError?.message ?? "Falha ao criar usuário no Auth");
    }

    const newId = created.user.id;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users")
      .upsert(
        {
          id: newId,
          email: data.email.trim().toLowerCase(),
          full_name: data.full_name.trim(),
          role,
          manager_id: managerId,
        } as never,
        { onConflict: "id" },
      )
      .select("id, email, full_name, role, manager_id, created_at, updated_at")
      .single();

    if (profileError) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(newId);
      } catch {
        /* ignore */
      }
      throw new Error(`Usuário criado no Auth, mas perfil falhou: ${profileError.message}`);
    }

    return { user: profile as AdminUserRow };
  });

/** Atualiza nome, papel e/ou gestor. Admin only (gestor não altera papéis). */
export const updateAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    if (data.id === userId && data.role && data.role !== "administrador") {
      throw new Error("Você não pode remover o próprio papel de administrador.");
    }

    const patch: Database["public"]["Tables"]["users"]["Update"] = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name.trim();
    if (data.role !== undefined) {
      patch.role = data.role;
      if (data.role === "administrador") patch.manager_id = null;
    }
    if (data.manager_id !== undefined) {
      patch.manager_id = data.role === "administrador" ? null : data.manager_id;
    }

    if (Object.keys(patch).length === 0) {
      throw new Error("Nenhum campo para atualizar.");
    }

    const { data: updated, error } = await supabase
      .from("users")
      .update(patch)
      .eq("id", data.id)
      .select("id, email, full_name, role, manager_id, created_at, updated_at")
      .single();

    if (error) throw new Error(`Falha ao atualizar: ${error.message}`);
    return { user: updated as AdminUserRow };
  });

/** Remove perfil + conta Auth (admin only; sem auto-exclusão). */
export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    if (data.id === userId) {
      throw new Error("Você não pode excluir a própria conta por aqui.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: delProfile } = await supabaseAdmin.from("users").delete().eq("id", data.id);
    if (delProfile) throw new Error(`Falha ao remover perfil: ${delProfile.message}`);

    const { error: delAuth } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (delAuth) throw new Error(`Perfil removido, mas Auth falhou: ${delAuth.message}`);

    return { ok: true as const };
  });

/** Lista SDRs da equipe (para atribuição de leads). Admin: todos SDRs; gestor: seus SDRs. */
export const listTeamSdrs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const me = await assertAdminOrGestor(supabase, userId);

    let query = supabase
      .from("users")
      .select("id, email, full_name, role, manager_id")
      .eq("role", "sdr")
      .order("full_name", { ascending: true });

    if (me.role === "gestor_comercial") {
      query = query.eq("manager_id", userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return {
      sdrs: (data ?? []) as Array<{
        id: string;
        email: string;
        full_name: string | null;
        role: UserRole;
        manager_id: string | null;
      }>,
    };
  });
