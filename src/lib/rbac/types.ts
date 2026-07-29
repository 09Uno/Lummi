export type UserRole = "administrador" | "gestor_comercial" | "sdr";

export type RBACUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  manager_id: string | null;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  administrador: "Administrador",
  gestor_comercial: "Gestor Comercial",
  sdr: "SDR",
};

/** Único e-mail autorizado a entrar via Google (e bootstrap como admin). */
export const GOOGLE_ADMIN_EMAIL = "jeorx99@gmail.com";

/** Papéis que acessam cada módulo */
export const MODULE_ROLES = {
  prospeccao: ["administrador", "gestor_comercial"] as UserRole[],
  inteligencia: ["administrador", "gestor_comercial", "sdr"] as UserRole[],
  crm: ["administrador", "gestor_comercial", "sdr"] as UserRole[],
  tarefas: ["administrador", "gestor_comercial", "sdr"] as UserRole[],
  relatorios: ["administrador", "gestor_comercial"] as UserRole[],
  configuracoes: ["administrador", "gestor_comercial", "sdr"] as UserRole[],
  admin: ["administrador", "gestor_comercial"] as UserRole[],
} as const;

/** Admin passa em qualquer gate de role */
export function roleAllows(
  userRole: UserRole | null | undefined,
  required: UserRole | UserRole[],
): boolean {
  if (!userRole) return false;
  if (userRole === "administrador") return true;
  const list = Array.isArray(required) ? required : [required];
  return list.includes(userRole);
}

export function canAccessModule(
  userRole: UserRole | null | undefined,
  module: keyof typeof MODULE_ROLES,
): boolean {
  return roleAllows(userRole, MODULE_ROLES[module]);
}
