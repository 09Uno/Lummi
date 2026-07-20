-- Remove tabela do fluxo OAuth de HubSpot antigo, que armazenava access_token
-- e refresh_token em texto puro e era alimentada por um callback OAuth que
-- expunha o client secret no bundle do frontend (VITE_HUBSPOT_CLIENT_SECRET).
--
-- O fluxo atual usa um HubSpot Private App Token (HUBSPOT_ACCESS_TOKEN) lido
-- exclusivamente no servidor via src/lib/hubspot.functions.ts — nada por
-- usuário precisa ser persistido.
DROP TABLE IF EXISTS public.hubspot_integrations;
