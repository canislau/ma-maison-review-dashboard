/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PublicClientApplication } from "@azure/msal-browser";

interface GoogleCredentialResponse { credential: string }
interface GoogleAccounts {
  id: {
    initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean }): void;
    renderButton(element: HTMLElement, options: Record<string, unknown>): void;
    disableAutoSelect(): void;
  };
}
declare global { interface Window { google?: { accounts: GoogleAccounts } } }

export interface GoogleUser { name: string; email: string; picture?: string; exp?: number }
type AuthProvider = "google" | "microsoft";
interface AuthValue {
  token: string | null;
  user: GoogleUser | null;
  provider: AuthProvider | null;
  microsoftConfigured: boolean;
  signInWithMicrosoft(): Promise<void>;
  signOut(): void;
}
const AuthContext = createContext<AuthValue>({ token: null, user: null, provider: null, microsoftConfigured: false, signInWithMicrosoft: async () => undefined, signOut: () => undefined });
const TOKEN_KEY = "ma-maison-auth-token";
const PROVIDER_KEY = "ma-maison-auth-provider";
const USER_KEY = "ma-maison-auth-user";
export function getStoredGoogleToken(): string | null { return sessionStorage.getItem(TOKEN_KEY); }

function decodeUser(token: string): GoogleUser | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as GoogleUser;
    return !payload.exp || payload.exp * 1000 > Date.now() ? payload : null;
  } catch { return null; }
}

const microsoftClientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined;
const microsoftTenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID as string | undefined;
let microsoftClient: PublicClientApplication | null = null;
async function getMicrosoftClient(): Promise<PublicClientApplication> {
  if (!microsoftClientId || !microsoftTenantId) throw new Error("Microsoft sign-in has not been configured yet.");
  if (!microsoftClient) {
    microsoftClient = new PublicClientApplication({
      auth: {
        clientId: microsoftClientId,
        authority: `https://login.microsoftonline.com/${microsoftTenantId}`,
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await microsoftClient.initialize();
  }
  return microsoftClient;
}

export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const initial = sessionStorage.getItem(TOKEN_KEY);
  const initialProvider = sessionStorage.getItem(PROVIDER_KEY) as AuthProvider | null;
  const savedUser = sessionStorage.getItem(USER_KEY);
  const initialUser = savedUser ? JSON.parse(savedUser) as GoogleUser : (initial ? decodeUser(initial) : null);
  const [token, setToken] = useState<string | null>(initial && initialUser ? initial : null);
  const [user, setUser] = useState<GoogleUser | null>(initialUser);
  const [provider, setProvider] = useState<AuthProvider | null>(initialProvider);
  const saveSession = (nextToken: string, nextUser: GoogleUser, nextProvider: AuthProvider) => {
    sessionStorage.setItem(TOKEN_KEY, nextToken);
    sessionStorage.setItem(PROVIDER_KEY, nextProvider);
    sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken); setUser(nextUser); setProvider(nextProvider);
  };
  const value = useMemo<AuthValue>(() => ({
    token, user, provider,
    microsoftConfigured: Boolean(microsoftClientId && microsoftTenantId),
    signInWithMicrosoft: async () => {
      const client = await getMicrosoftClient();
      const result = await client.loginPopup({ scopes: ["openid", "profile", "email", "User.Read"], prompt: "select_account" });
      const email = (result.account?.username || "").toLowerCase();
      if (!result.accessToken || !email) throw new Error("Microsoft did not return a usable account token.");
      saveSession(result.accessToken, { name: result.account?.name || email, email }, "microsoft");
    },
    signOut: () => {
      sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(PROVIDER_KEY); sessionStorage.removeItem(USER_KEY);
      setToken(null); setUser(null); setProvider(null); window.google?.accounts.id.disableAutoSelect();
      if (provider === "microsoft") void getMicrosoftClient().then((client) => client.logoutPopup()).catch(() => undefined);
    },
  }), [token, user, provider]);
  return <AuthContext.Provider value={value}>{children}<CredentialReceiver onCredential={(credential) => { const nextUser = decodeUser(credential); if (nextUser) saveSession(credential, nextUser, "google"); }} /></AuthContext.Provider>;
}

function CredentialReceiver({ onCredential }: { onCredential: (credential: string) => void }) {
  useEffect(() => {
    (window as Window & { __maMaisonCredential?: (credential: string) => void }).__maMaisonCredential = onCredential;
  }, [onCredential]);
  return null;
}

export function GoogleSignInButton() {
  const ref = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  useEffect(() => {
    const initialise = () => {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => (window as Window & { __maMaisonCredential?: (credential: string) => void }).__maMaisonCredential?.(credential) });
      window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", width: 320, text: "signin_with" });
    };
    if (window.google) { initialise(); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true; script.defer = true; script.onload = initialise;
    document.head.appendChild(script);
    return () => { script.onload = null; };
  }, [clientId]);
  return <div ref={ref} className="flex justify-center" />;
}

export function MicrosoftSignInButton() {
  const { microsoftConfigured, signInWithMicrosoft } = useContext(AuthContext);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!microsoftConfigured) return null;
  return <div>
    <button type="button" className="btn-secondary w-full justify-center" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await signInWithMicrosoft(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Microsoft sign-in failed."); }
      finally { setBusy(false); }
    }}>{busy ? "Signing in…" : "Sign in with Microsoft"}</button>
    {error && <p className="text-xs text-danger mt-2">{error}</p>}
  </div>;
}

export function useGoogleAuth(): AuthValue { return useContext(AuthContext); }
