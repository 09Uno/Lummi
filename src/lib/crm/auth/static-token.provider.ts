import type { AuthProvider } from "./auth-provider";

/**
 * Provider de token estático (Private App Token).
 * Usado no MVP — nunca chama OAuth, apenas devolve o token injetado.
 * NÃO acessa process.env; recebe o valor pelo construtor para manter a
 * abstração e permitir troca por OAuthAuthProvider no futuro.
 */
export class StaticTokenAuthProvider implements AuthProvider {
  constructor(private readonly token: string) {}

  async getAccessToken(): Promise<string> {
    if (!this.token || !this.token.trim()) {
      throw new Error(
        "HubSpot não configurado. Configure HUBSPOT_ACCESS_TOKEN nas variáveis de ambiente.",
      );
    }
    return this.token.trim();
  }
}
