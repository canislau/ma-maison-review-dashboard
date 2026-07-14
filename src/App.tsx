import { useState } from "react";
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from "@azure/msal-react";
import { loginRequest } from "./lib/authConfig";
import { useUserRole } from "./hooks/useUserRole";
import OverviewTab from "./pages/OverviewTab";
import ConcernReviewsTab from "./pages/ConcernReviewsTab";
import AllReviewsTab from "./pages/AllReviewsTab";

type TabKey = "overview" | "concern" | "all";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "concern", label: "Concern Reviews" },
  { key: "all", label: "All Reviews" },
];

function SignInScreen() {
  const { instance } = useMsal();
  return (
    <div className="min-h-screen flex items-center justify-center bg-section">
      <div className="card max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-full bg-accent-100 mx-auto mb-4 flex items-center justify-center text-accent-700 font-semibold">
          MM
        </div>
        <h1 className="text-lg font-semibold text-ink mb-1">Ma Maison Review Dashboard</h1>
        <p className="text-sm text-ink-muted mb-6">Sign in with your Clearwater Microsoft account to continue.</p>
        <button className="btn-primary w-full justify-center" onClick={() => instance.loginPopup(loginRequest)}>
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const { instance } = useMsal();
  const { role, name } = useUserRole();

  return (
    <div className="min-h-screen">
      <header className="bg-surface border-b border-border sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-accent-600 text-white flex items-center justify-center font-semibold text-sm shrink-0">
              MM
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-ink truncate">Ma Maison Review Management</h1>
              <p className="text-xs text-ink-muted truncate">{name} · {role}</p>
            </div>
          </div>
          <button
            className="btn-secondary shrink-0"
            onClick={() => instance.logoutPopup({ postLogoutRedirectUri: window.location.origin })}
          >
            Sign out
          </button>
        </div>
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "border-accent-600 text-accent-700"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "concern" && <ConcernReviewsTab />}
        {activeTab === "all" && <AllReviewsTab />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <AuthenticatedTemplate>
        <AppShell />
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <SignInScreen />
      </UnauthenticatedTemplate>
    </>
  );
}
