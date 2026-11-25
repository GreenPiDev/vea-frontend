import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SEARCH_DEBOUNCE_MS, usePagedListState } from "./usePagedListState";
import { withQuery } from "./api/paged";

type Filters = { status?: string; decision?: string };

describe("usePagedListState", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts on page 1 with no search and the given filters", () => {
    const { result } = renderHook(() => usePagedListState<Filters>({}, 20));
    expect(result.current.params).toEqual({ page: 1, pageSize: 20, search: undefined });
    expect(result.current.isFiltered).toBe(false);
  });

  it("debounces the search: nothing is sent until typing pauses", () => {
    const { result } = renderHook(() => usePagedListState<Filters>({}));
    act(() => result.current.setSearchInput("ay"));
    act(() => result.current.setSearchInput("ayşe"));
    expect(result.current.params.search).toBeUndefined();

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(result.current.params.search).toBe("ayşe");
    expect(result.current.isFiltered).toBe(true);
  });

  it("trims the search and sends nothing for whitespace", () => {
    const { result } = renderHook(() => usePagedListState<Filters>({}));
    act(() => result.current.setSearchInput("   "));
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(result.current.params.search).toBeUndefined();
  });

  it("a new search jumps back to page 1", () => {
    const { result } = renderHook(() => usePagedListState<Filters>({}));
    act(() => result.current.setPage(3));
    expect(result.current.params.page).toBe(3);

    act(() => result.current.setSearchInput("gece"));
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(result.current.params.page).toBe(1);
  });

  it("changing a filter sets it and jumps back to page 1; empty clears it", () => {
    const { result } = renderHook(() => usePagedListState<Filters>({}));
    act(() => result.current.setPage(4));
    act(() => result.current.setFilter("status", "PENDING"));
    expect(result.current.params).toMatchObject({ page: 1, status: "PENDING" });
    expect(result.current.isFiltered).toBe(true);

    act(() => result.current.setFilter("status", ""));
    expect(result.current.params.status).toBeUndefined();
    expect(result.current.isFiltered).toBe(false);
  });
});

describe("withQuery", () => {
  it("serializes params, skipping undefined and empty values", () => {
    expect(withQuery("/organizations/o1/offers", { page: 2, pageSize: 20, search: "a b", status: undefined, decision: "" })).toBe(
      "/organizations/o1/offers?page=2&pageSize=20&search=a+b",
    );
  });

  it("returns the bare path when there is nothing to send", () => {
    expect(withQuery("/x", { search: undefined })).toBe("/x");
  });
});
