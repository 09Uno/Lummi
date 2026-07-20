import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, Lock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!mounted) return null;

  function mapAuthError(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes("invalid login") || m.includes("invalid_credentials"))
      return "E-mail ou senha incorretos.";
    if (m.includes("email not confirmed"))
      return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
    if (m.includes("user already registered") || m.includes("already exists"))
      return "Este e-mail já está cadastrado. Faça login.";
    if (m.includes("rate limit") || m.includes("too many"))
      return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    if (m.includes("weak password") || m.includes("password should"))
      return "Senha muito fraca. Use pelo menos 8 caracteres.";
    if (m.includes("invalid email")) return "E-mail inválido.";
    return msg;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setInfo("Conta criada! Verifique seu e-mail para confirmar (se necessário) e faça login.");
        setMode("signin");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("Enviamos um link de recuperação para o seu e-mail (se a conta existir).");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(mapAuthError(err instanceof Error ? err.message : "Erro inesperado"));
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) setError(mapAuthError(result.error.message ?? "Falha ao entrar com Google"));
  }

  return (
    <main className="min-h-screen bg-hero-gradient flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-white text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" /> LUMMI
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
            {mode === "signin"
              ? "Entre na sua conta"
              : mode === "signup"
                ? "Crie sua conta"
                : "Recupere sua senha"}
          </h1>
          <p className="mt-2 text-white/80 text-sm">
            {mode === "forgot"
              ? "Enviaremos um link seguro para você redefinir a senha."
              : "Prospecção B2B com IA — leads qualificados em segundos."}
          </p>
        </div>

        <div className="bg-card rounded-3xl shadow-card-soft p-6 sm:p-8 space-y-5">
          {mode !== "forgot" && (
            <>
              <button
                type="button"
                onClick={onGoogle}
                className="w-full h-11 rounded-2xl border border-border bg-white text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-secondary transition"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                  <path
                    fill="#FFC107"
                    d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.3 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.3 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24 44c5.3 0 10.1-2 13.7-5.3l-6.3-5.2C29.3 35.1 26.8 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39.7 16.2 44 24 44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.2C41.9 35.6 44 30.2 44 24c0-1.2-.1-2.3-.4-3.5z"
                  />
                </svg>
                Entrar com Google
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground font-semibold">OU</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 pl-10 pr-3 rounded-2xl border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground transition"
                  placeholder="voce@empresa.com"
                />
              </div>
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-foreground">Senha</label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                        setInfo(null);
                      }}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 pl-10 pr-3 rounded-2xl border border-border bg-white text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground transition"
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full h-12 rounded-2xl text-sm font-bold text-white transition-all",
                "bg-gradient-to-r from-[oklch(0.65_0.24_15)] via-[oklch(0.55_0.26_340)] to-[oklch(0.5_0.24_290)]",
                "shadow-[0_10px_30px_-10px_oklch(0.55_0.26_340/0.6)] disabled:opacity-50",
              )}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === "signin" ? "Entrando…" : mode === "signup" ? "Criando…" : "Enviando…"}
                </span>
              ) : mode === "signin" ? (
                "Entrar"
              ) : mode === "signup" ? (
                "Cadastrar"
              ) : (
                "Enviar link de recuperação"
              )}
            </button>
          </form>

          {error && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 text-sm p-3">
              {info}
            </div>
          )}

          <div className="text-center text-sm text-muted-foreground">
            {mode === "signin" && (
              <>
                Não tem conta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setInfo(null);
                  }}
                  className="font-bold text-foreground hover:underline"
                >
                  Cadastre-se
                </button>
              </>
            )}
            {mode === "signup" && (
              <>
                Já tem conta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setInfo(null);
                  }}
                  className="font-bold text-foreground hover:underline"
                >
                  Entrar
                </button>
              </>
            )}
            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
                className="font-bold text-foreground hover:underline"
              >
                Voltar para login
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
