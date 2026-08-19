import { createContext, useContext, type ReactNode } from "react";
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
  return (
    <ExhibitionContext.Provider value={{ exhibition, layout }}>
      {children}
    </ExhibitionContext.Provider>
  );
}

export function useExhibition(): ExhibitionContextValue {
  const ctx = useContext(ExhibitionContext);
  if (!ctx) throw new Error("useExhibition must be used within an ExhibitionProvider");
  return ctx;
}
