/**
 * Contrato de autenticação para provedores de CRM.
 * Hoje: StaticTokenAuthProvider (Private App Token da HubSpot).
 * Futuro: OAuthAuthProvider (refresh flow) — plug-and-play.
 */
export interface AuthProvider {
  getAccessToken(): Promise<string>;
}
