import React from "react";
import ReactDOM from "react-dom/client";
import { PublicClientApplication, EventType } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./lib/authConfig";
import { initApiClient } from "./lib/apiClient";
import App from "./App";
import "./index.css";

const msalInstance = new PublicClientApplication(msalConfig);

msalInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
    const account = (event.payload as { account?: unknown }).account;
    if (account) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      msalInstance.setActiveAccount(account as any);
    }
  }
});

// Restore an already-signed-in account on reload without forcing a redirect.
const existingAccounts = msalInstance.getAllAccounts();
if (existingAccounts.length > 0 && !msalInstance.getActiveAccount()) {
  msalInstance.setActiveAccount(existingAccounts[0]);
}

initApiClient(msalInstance);

msalInstance.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>
  );
});
