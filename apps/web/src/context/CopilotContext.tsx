"use client";

import * as React from "react";

export interface CopilotContextType {
  copilotEnabled: boolean;
  setCopilotEnabled: (enabled: boolean) => void;
  toggleCopilot: () => void;
}

const COPILOT_ENABLED_STORAGE_KEY = "ccip_copilot_enabled";

const CopilotContext = React.createContext<CopilotContextType | undefined>(undefined);

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  // Defaults to enabled -- the Copilot's pre-existing shipped behavior
  // (route-aware guide popovers, on-demand audio) is what every user has
  // already had; this toggle is an opt-out escape hatch for power users,
  // not a silent regression for everyone else. Read from localStorage
  // after mount only (not as the useState initializer), matching every
  // other persisted preference in AppShell -- localStorage doesn't exist
  // during SSR, so reading it any earlier would desync the first client
  // render from the server-rendered markup.
  const [copilotEnabled, setCopilotEnabledState] = React.useState(true);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COPILOT_ENABLED_STORAGE_KEY);
      if (raw !== null) setCopilotEnabledState(raw === "true");
    } catch {
      // Private browsing / storage blocked -- default (enabled) stands.
    }
  }, []);

  const setCopilotEnabled = React.useCallback((enabled: boolean) => {
    setCopilotEnabledState(enabled);
    try {
      window.localStorage.setItem(COPILOT_ENABLED_STORAGE_KEY, String(enabled));
    } catch {
      // Same as above -- the toggle still works for this session either way.
    }
  }, []);

  const toggleCopilot = React.useCallback(() => {
    setCopilotEnabledState((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COPILOT_ENABLED_STORAGE_KEY, String(next));
      } catch {
        // Same as above.
      }
      return next;
    });
  }, []);

  return (
    <CopilotContext.Provider value={{ copilotEnabled, setCopilotEnabled, toggleCopilot }}>
      {children}
    </CopilotContext.Provider>
  );
}

export function useCopilot() {
  const ctx = React.useContext(CopilotContext);
  if (!ctx) throw new Error("useCopilot must be used within CopilotProvider");
  return ctx;
}
