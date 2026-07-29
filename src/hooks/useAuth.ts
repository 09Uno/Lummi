import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { RBACUser, UserRole } from "@/lib/rbac/types";
import { GOOGLE_ADMIN_EMAIL, roleAllows } from "@/lib/rbac/types";
import { ensureAdminProfile } from "@/lib/rbac/admin.functions";

type AuthState = {
  user: RBACUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  /** true só no bootstrap inicial — NUNCA em TOKEN_REFRESHED / soft */
  isLoading: boolean;
  accessDenied: boolean;
  /** já resolvemos a sessão pelo menos uma vez nesta aba */
  ready: boolean;
};

type AuthContextValue = AuthState & {
  hasPermission: (action: string, resource: string) => boolean;
  canAccess: (required: UserRole | UserRole[]) => boolean;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const INITIAL: AuthState = {
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
  accessDenied: false,
  ready: false,
};

/**
 * Resolve perfil a partir de uma Session já conhecida.
 * NÃO chame getSession() daqui quando vier de onAuthStateChange —
 * isso deadlocka o client do Supabase (lock de auth) e trava o login em "Entrando…".
 */
async function resolveProfile(session: Session | null): Promise<{
  user: RBACUser | null;
  accessDenied: boolean;
}> {
  if (!session?.user) {
    return { user: null, accessDenied: false };
  }

  const email = (session.user.email ?? "").trim().toLowerCase();

  let { data: profile, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, manager_id")
    .eq("id", session.user.id)
    .maybeSingle();

  if ((!profile || error) && email === GOOGLE_ADMIN_EMAIL) {
    try {
      await ensureAdminProfile();
      const retry = await supabase
        .from("users")
        .select("id, email, full_name, role, manager_id")
        .eq("id", session.user.id)
        .maybeSingle();
      profile = retry.data;
      error = retry.error;
    } catch {
      /* ignore — cai no bloqueio abaixo */
    }
  }

  if (error || !profile) {
    // signOut fora do callback síncrono de onAuthStateChange (já estamos deferred)
    await supabase.auth.signOut();
    return { user: null, accessDenied: true };
  }

  return { user: profile as RBACUser, accessDenied: false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL);
  const bootstrapped = useRef(false);
  const gen = useRef(0); // evita race: resposta antiga sobrescrevendo a nova

  const applySession = useCallback(async (session: Session | null, opts?: { soft?: boolean }) => {
    const soft = opts?.soft === true;
    const myGen = ++gen.current;

    if (!soft) {
      setState((s) => ({ ...s, isLoading: true }));
    }

    try {
      const { user, accessDenied } = await resolveProfile(session);
      if (myGen !== gen.current) return; // obsoleto

      if (!user) {
        setState({
          user: null,
          role: null,
          isAuthenticated: false,
          isLoading: false,
          accessDenied,
          ready: true,
        });
        return;
      }

      setState({
        user,
        role: user.role,
        isAuthenticated: true,
        isLoading: false,
        accessDenied: false,
        ready: true,
      });
    } catch {
      if (myGen !== gen.current) return;
      setState({
        user: null,
        role: null,
        isAuthenticated: false,
        isLoading: false,
        accessDenied: false,
        ready: true,
      });
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      await applySession(data.session, { soft: false });
    } catch (err) {
      console.error("[Auth] reload() falhou:", err);
      setState({
        user: null,
        role: null,
        isAuthenticated: false,
        isLoading: false,
        accessDenied: false,
        ready: true,
      });
    }
  }, [applySession]);

  useEffect(() => {
    let active = true;

    // 1) Bootstrap inicial — getSession é seguro fora do callback de onAuthStateChange
    //    IMPORTANTE: se getSession() rejeitar (env var ausente/errada, projeto Supabase
    //    inacessível, CORS, etc.), sem este try/catch a Promise fica unhandled e o
    //    estado nunca sai de isLoading:true/ready:false — spinner infinito e silencioso.
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        await applySession(data.session, { soft: false });
        bootstrapped.current = true;
      } catch (err) {
        if (!active) return;
        console.error("[Auth] Falha ao inicializar sessão (getSession):", err);
        setState({
          user: null,
          role: null,
          isAuthenticated: false,
          isLoading: false,
          accessDenied: false,
          ready: true,
        });
      }
    })();

    // 2) Listener — NUNCA chamar getSession dentro do callback síncrono.
    //    setTimeout(0) libera o auth lock do supabase-js antes do await.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      window.setTimeout(() => {
        if (!active) return;

        if (event === "SIGNED_OUT" || !session) {
          gen.current += 1;
          setState({
            user: null,
            role: null,
            isAuthenticated: false,
            isLoading: false,
            accessDenied: false,
            ready: true,
          });
          return;
        }

        // INITIAL_SESSION já foi coberto pelo getSession do boot — evita double-fetch
        if (event === "INITIAL_SESSION" && bootstrapped.current) {
          return;
        }

        const soft =
          bootstrapped.current || event === "TOKEN_REFRESHED" || event === "USER_UPDATED";

        void applySession(session, { soft });
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const hasPermission = useCallback(
    (_action: string, _resource: string) => {
      if (state.role === "administrador") return true;
      return Boolean(state.role);
    },
    [state.role],
  );

  const canAccess = useCallback(
    (required: UserRole | UserRole[]) => roleAllows(state.role, required),
    [state.role],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      hasPermission,
      canAccess,
      logout,
      reload,
    }),
    [state, hasPermission, canAccess, logout, reload],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      "useAuth() deve ser usado dentro de <AuthProvider>. Verifique src/routes/__root.tsx.",
    );
  }
  return ctx;
}
