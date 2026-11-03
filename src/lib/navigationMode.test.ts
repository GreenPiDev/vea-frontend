import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNavigationMode, saveNavigationMode } from "./navigationMode";

function mockPointer(coarse: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: coarse)" ? coarse : false }));
}

describe("navigationMode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("defaults to click-to-go", () => {
    mockPointer(false);
    expect(loadNavigationMode()).toBe("click");
  });

  it("remembers the visitor's choice on desktop", () => {
    mockPointer(false);
    saveNavigationMode("walk");
    expect(loadNavigationMode()).toBe("walk");
  });

  it("always uses click-to-go on touch devices", () => {
    mockPointer(true);
    saveNavigationMode("walk");
    expect(loadNavigationMode()).toBe("click");
  });

  it("ignores garbage in storage", () => {
    mockPointer(false);
    window.localStorage.setItem("vea.navigationMode", "fly");
    expect(loadNavigationMode()).toBe("click");
  });
});
