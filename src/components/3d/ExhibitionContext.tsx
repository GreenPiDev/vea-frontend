import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Exhibition } from "./exhibitions";
import type { RoomLayout } from "./galleryLayout";

interface ExhibitionContextValue {
  exhibition: Exhibition;
  layout: RoomLayout;
}

const ExhibitionContext = createContext<ExhibitionContextValue | null>(null);

export function ExhibitionProvider({
  exhibition,
  layout,
  children,
}: ExhibitionContextValue & { children: ReactNode }) {
  // Stable value: every 3D consumer re-renders when it changes, so it may only change with the room itself.
  const value = useMemo(() => ({ exhibition, layout }), [exhibition, layout]);
  return (
    <ExhibitionContext.Provider value={value}>
      {children}
    </ExhibitionContext.Provider>
  );
}

export function useExhibition(): ExhibitionContextValue {
  const ctx = useContext(ExhibitionContext);
  if (!ctx) throw new Error("useExhibition must be used within an ExhibitionProvider");
  return ctx;
}
