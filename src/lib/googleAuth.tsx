/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

interface GoogleCredentialResponse { credential: string }
interface GoogleAccounts {
  id: {
    initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean }): void;
    renderButton(element: HTMLElement, options: Record<string, unknown>): void;
    disableAutoSelect(): void;
  };
}
declare global { interface Window { google?: { accounts: GoogleAccounts } } }

export interface GoogleUser { name: string; email: string; picture?: string; exp: number }
interface AuthValue { token: string | null; user: GoogleUser | null; signOut(): void }
const AuthContext = createContext<AuthValue>({ token: null, user: null, signOut: () => undefined });
const TOKEN_KEY = "ma-maison-google-credential";
export function getStoredGoogleToken(): string | null { return sessionStorage.getItem(TOKEN_KEY); }

function decodeUser(token: string): GoogleUser | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as GoogleUser;
    return payload.exp * 1000 > Date.now() ? payload : null;
  } catch { return null; }
}

export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const initial = sessionStorage.getItem(TOKEN_KEY);
  const [token, setToken] = useState<string | null>(initial && decodeUser(initial) ? initial : null);
  const value = useMemo<AuthValue>(() => ({
    token,
    user: token ? decodeUser(token) : null,
    signOut: () => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); window.google?.accounts.id.disableAutoSelect(); },
  }), [token]);
  return <AuthContext.Provider value={value}>{children}<CredentialReceiver onCredential={(credential) => { sessionStorage.setItem(TOKEN_KEY, credential); setToken(credential); }} /></AuthContext.Provider>;
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

export function useGoogleAuth(): AuthValue { return useContext(AuthContext); }
