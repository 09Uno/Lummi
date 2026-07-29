import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, RefreshCw, Shield, Trash2, UserCog, Users } from "lucide-react";
import { ProtectedRoute } from "@/components/rbac/ProtectedRoute";
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
  type AdminUserRow,
} from "@/lib/rbac/admin.functions";
import { ROLE_LABELS, type UserRole } from "@/lib/rbac/types";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  component: AdminRoute,
});

function AdminRoute() {
  return (
    <ProtectedRoute requiredRoles={["administrador", "gestor_comercial"]}>
      <AdminPage />
    </ProtectedRoute>
  );
}

function AdminPage() {
  const { role: myRole } = useAuth();
  const isAdmin = myRole === "administrador";
  const ROLE_OPTIONS: UserRole[] = isAdmin ? ["administrador", "gestor_comercial", "sdr"] : ["sdr"];

  const listFn = useServerFn(listAdminUsers);
  const createFn = useServerFn(createAdminUser);
  const updateFn = useServerFn(updateAdminUser);
  const deleteFn = useServerFn(deleteAdminUser);

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // form
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("sdr");
  const [managerId, setManagerId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // inline edit role
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);

  const gestores = useMemo(
    () => users.filter((u) => u.role === "gestor_comercial" || u.role === "administrador"),
    [users],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listFn();
      setUsers(res.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEmail("");
    setPassword("");
    setFullName("");
    setRole("sdr");
    setManagerId("");
    setShowForm(false);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      await createFn({
        data: {
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          role,
          manager_id: managerId || null,
        },
      });
      setInfo(`Usuário ${email.trim()} criado com sucesso.`);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar usuário");
    } finally {
      setSaving(false);
    }
  }

  async function onChangeRole(user: AdminUserRow, nextRole: UserRole) {
    if (user.role === nextRole) return;
    setPendingRoleId(user.id);
    setError(null);
    setInfo(null);
    try {
      await updateFn({
        data: {
          id: user.id,
          role: nextRole,
          manager_id: nextRole === "administrador" ? null : user.manager_id,
        },
      });
      setInfo(`Papel de ${user.email} atualizado para ${ROLE_LABELS[nextRole]}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar papel");
    } finally {
      setPendingRoleId(null);
    }
  }

  async function onChangeManager(user: AdminUserRow, nextManagerId: string) {
    setPendingRoleId(user.id);
    setError(null);
    try {
      await updateFn({
        data: {
          id: user.id,
          manager_id: nextManagerId || null,
        },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar gestor");
    } finally {
      setPendingRoleId(null);
    }
  }

  async function onDelete(user: AdminUserRow) {
    if (
      !window.confirm(`Excluir permanentemente ${user.email}? Esta ação não pode ser desfeita.`)
    ) {
      return;
    }
    setError(null);
    setInfo(null);
    try {
      await deleteFn({ data: { id: user.id } });
      setInfo(`${user.email} removido.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir");
    }
  }

  function managerLabel(id: string | null): string {
    if (!id) return "—";
    const m = users.find((u) => u.id === id);
    return m ? m.full_name || m.email : id.slice(0, 8);
  }

  return (
    <main className="min-h-full">
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-20">
        <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Início
            </Link>
            <div className="h-4 w-px bg-white/20" />
            <div className="inline-flex items-center gap-2 text-white">
              <Shield className="w-4 h-4 text-[var(--cy-muted)]" />
              <h1 className="text-lg font-bold tracking-tight">Administração</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-surface-hover)] text-xs font-semibold text-[var(--cy-muted)] hover:border-[#0F4C5C] transition disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0F4C5C] hover:bg-[#2E7A85] text-xs font-semibold text-white transition"
            >
              <Plus className="w-3.5 h-3.5" />
              {showForm ? "Fechar formulário" : "Novo usuário"}
            </button>
          </div>
        </div>

        <p className="text-sm text-white/70 mb-6 max-w-2xl">
          Cadastre a equipe. Administradores gerenciam todos os papéis; gestores criam apenas SDRs.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm p-4">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm p-4">
            {info}
          </div>
        )}

        {showForm && (
          <section className="mb-6 rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] p-5 sm:p-6">
            <h2 className="text-sm font-bold text-[var(--cy-content-ink)] mb-4 flex items-center gap-2">
              <UserCog className="w-4 h-4 text-[#0F4C5C]" />
              Criar usuário
            </h2>
            <form onSubmit={onCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[var(--cy-content-ink)] mb-1.5">
                  Nome completo
                </label>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex: Maria Silva"
                  className="w-full h-10 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--cy-content-ink)] mb-1.5">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full h-10 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--cy-content-ink)] mb-1.5">
                  Senha inicial
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full h-10 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--cy-content-ink)] mb-1.5">
                  Papel
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full h-10 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C]"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--cy-content-ink)] mb-1.5">
                  Gestor (para SDR){" "}
                  <span className="text-[var(--cy-muted)] font-normal">opcional</span>
                </label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  disabled={role === "administrador"}
                  className="w-full h-10 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C] disabled:opacity-50"
                >
                  <option value="">— Nenhum —</option>
                  {gestores.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.full_name || g.email} ({ROLE_LABELS[g.role]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 h-10 rounded-lg border border-[var(--cy-card-border)] text-xs font-semibold text-[var(--cy-muted)] hover:bg-[var(--cy-surface-hover)] transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[#0F4C5C] hover:bg-[#2E7A85] text-xs font-semibold text-white transition disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  {saving ? "Criando…" : "Criar usuário"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#0f3038]">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--cy-muted)]" />
              <h2 className="text-sm font-bold text-[var(--cy-content-ink)]">
                Usuários do sistema
              </h2>
            </div>
            <span className="text-xs text-[var(--cy-muted)]">
              {loading ? "Carregando…" : `${users.length} usuário(s)`}
            </span>
          </div>

          {loading && users.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--cy-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando usuários…
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-sm text-[var(--cy-muted)]">
              Nenhum usuário encontrado em <code className="text-xs">public.users</code>.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-[var(--cy-muted)] border-b border-[#0f3038]">
                    <th className="px-5 py-3 font-semibold">Nome</th>
                    <th className="px-3 py-3 font-semibold">E-mail</th>
                    <th className="px-3 py-3 font-semibold">Papel</th>
                    <th className="px-3 py-3 font-semibold">Gestor</th>
                    <th className="px-3 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const busy = pendingRoleId === u.id;
                    return (
                      <tr
                        key={u.id}
                        className="border-b border-[#0f3038] last:border-0 hover:bg-[var(--cy-input-bg)]/80 transition"
                      >
                        <td className="px-5 py-3">
                          <div className="font-medium text-[var(--cy-content-ink)]">
                            {u.full_name || "—"}
                          </div>
                          <div className="text-[10px] text-[var(--cy-muted)] font-mono mt-0.5">
                            {u.id.slice(0, 8)}…
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[var(--cy-muted)]">{u.email}</td>
                        <td className="px-3 py-3">
                          {isAdmin ? (
                            <select
                              value={u.role}
                              disabled={busy}
                              onChange={(e) => void onChangeRole(u, e.target.value as UserRole)}
                              className="h-8 rounded-md border border-[var(--cy-card-border)] bg-[var(--cy-surface-hover)] px-2 text-xs text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C] disabled:opacity-50"
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-[var(--cy-muted)]">
                              {ROLE_LABELS[u.role]}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {u.role === "administrador" ? (
                            <span className="text-xs text-[var(--cy-muted)]">—</span>
                          ) : (
                            <select
                              value={u.manager_id ?? ""}
                              disabled={busy}
                              onChange={(e) => void onChangeManager(u, e.target.value)}
                              className="h-8 max-w-[160px] rounded-md border border-[var(--cy-card-border)] bg-[var(--cy-surface-hover)] px-2 text-xs text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C] disabled:opacity-50"
                            >
                              <option value="">— Nenhum —</option>
                              {gestores
                                .filter((g) => g.id !== u.id)
                                .map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.full_name || g.email}
                                  </option>
                                ))}
                            </select>
                          )}
                          {u.role === "sdr" && u.manager_id && (
                            <div className="text-[10px] text-[var(--cy-muted)] mt-0.5 sm:hidden">
                              {managerLabel(u.manager_id)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => void onDelete(u)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-[#f87171] hover:bg-[#e01e2c]/15 transition"
                              title="Excluir usuário"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Excluir</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-6 text-[11px] text-[var(--cy-muted)] leading-relaxed max-w-3xl">
          RBAC v2 · Gestor cria só SDR · Admin gerencia tudo · service role (
          <code>SUPABASE_SERVICE_ROLE_KEY</code>). Policies RLS em <code>public.users</code> isolam
          leitura/escrita por papel.
        </p>
      </div>
    </main>
  );
}
