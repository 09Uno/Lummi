import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Supabase sends the recovery token in the URL hash; the SDK parses it
    // and fires PASSWORD_RECOVERY, giving us a temporary session to updateUser().
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Fallback: if the session is already present on mount.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!mounted) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Senha muito curta. Use pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/", replace: true }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao redefinir senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-hero-gradient flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-white text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" /> LUMMI
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Nova senha</h1>
          <p className="mt-2 text-white/80 text-sm">
            Defina uma nova senha para acessar sua conta.
          </p>
        </div>

        <div className="bg-card rounded-3xl shadow-card-soft p-6 sm:p-8 space-y-5">
          {!ready ? (
            <div className="text-sm text-muted-foreground text-center inline-flex items-center gap-2 justify-center w-full py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Validando link…
            </div>
          ) : done ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 text-sm p-4 text-center">
              Senha alterada com sucesso. Redirecionando…
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <PasswordField
                label="Nova senha"
                value={password}
                onChange={setPassword}
                placeholder="Mínimo 6 caracteres"
              />
              <PasswordField
                label="Confirmar senha"
                value={confirm}
                onChange={setConfirm}
                placeholder="Repita a nova senha"
              />
              <button
                type="submit"
                disabled={loading}
                className={cn(
                  "w-full h-12 rounded-2xl text-sm font-bold text-white transition-all",
                  "bg-gradient-to-r from-[oklch(0.65_0.24_15)] via-[oklch(0.55_0.26_340)] to-[oklch(0.5_0.24_290)]",
                  "disabled:opacity-50",
                )}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Salvando…
                  </span>
                ) : (
                  "Salvar nova senha"
                )}
              </button>
              {error && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3">
                  {error}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-foreground mb-1.5">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="password"
          required
          minLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-11 pl-10 pr-3 rounded-2xl border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground transition"
        />
      </div>
    </div>
  );
}
