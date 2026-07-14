// ============================================================================
// MSAL (Entra ID) configuration for the frontend.
//
// Reads Entra ID app registration details from Vite env vars — these are
// PUBLIC values (client ID, tenant ID, redirect URI), safe to ship to the
// browser. Never put the client SECRET here; that lives only in the backend
// (functions/_lib) as an environment variable / Cloudflare secret.
// ============================================================================

import type { Configuration } from "@azure/msal-browser";

const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID as string;
const tenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID as string;

if (!clientId || !tenantId) {
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_MICROSOFT_CLIENT_ID / VITE_MICROSOFT_TENANT_ID are not set. Sign-in will not work until these are configured in your .env file."
  );
}

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId || "",
    authority: `https://login.microsoftonline.com/${tenantId || "common"}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    // sessionStorage (not localStorage) per MSAL best practice — this is
    // MSAL's own token cache, not app data storage, and is the recommended
    // configuration in Microsoft's official documentation.
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

/**
 * Scope requested for API access tokens. This should match the Application
 * ID URI + a custom scope exposed on your Entra ID app registration
 * (Expose an API blade), e.g. api://<client-id>/access_as_user.
 */
export const apiTokenRequest = {
  scopes: [`api://${clientId}/access_as_user`],
};

export const loginRequest = {
  scopes: ["openid", "profile", "email", ...apiTokenRequest.scopes],
};
