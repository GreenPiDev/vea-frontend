import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../../lib/i18n";
import i18n from "../../lib/i18n";
import PagedList from "./PagedList";
import Pagination from "./Pagination";
import type { PagedListState } from "../../lib/usePagedListState";
import type { Paginated } from "../../lib/api/paged";

type Row = { id: string; name: string };
type Filters = { status?: "A" | "B" };

function listState(overrides: Partial<PagedListState<Filters>> = {}): PagedListState<Filters> {
  return {
    searchInput: "",
    setSearchInput: vi.fn(),
    search: "",
    filters: {},
    setFilter: vi.fn(),
    page: 1,
    setPage: vi.fn(),
    pageSize: 2,
    params: { page: 1, pageSize: 2 },
    isFiltered: false,
    ...overrides,
  };
}

const page = (items: Row[], total: number, p = 1): Paginated<Row> => ({ items, total, page: p, pageSize: 2 });

function renderList(list: PagedListState<Filters>, data: Paginated<Row> | undefined) {
  return render(
    <PagedList
      list={list}
      query={{ data, isLoading: false, isFetching: false }}
      searchPlaceholder="Ara"
      filters={[{ key: "status", label: "Durum", options: [{ value: "A", label: "Durum A" }] }]}
      columns={[{ key: "name", header: "Ad", render: (row: Row) => row.name }]}
      getRowKey={(row) => row.id}
      emptyMessage="Henüz kayıt yok"
    />,
  );
}

describe("PagedList", () => {
  it("renders the page's rows and wires search + filter to the list state", () => {
    const list = listState();
    renderList(list, page([{ id: "1", name: "Bir" }, { id: "2", name: "İki" }], 5));

    expect(screen.getByText("Bir")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Ara" }), { target: { value: "bi" } });
    expect(list.setSearchInput).toHaveBeenCalledWith("bi");

    fireEvent.change(screen.getByRole("combobox", { name: "Durum" }), { target: { value: "A" } });
    expect(list.setFilter).toHaveBeenCalledWith("status", "A");
  });

  it("says 'no results' (not 'empty') when a search/filter is active", () => {
    renderList(listState({ isFiltered: true }), page([], 0));
    expect(screen.getByText(i18n.t("listNoResults"))).toBeInTheDocument();
    expect(screen.queryByText("Henüz kayıt yok")).not.toBeInTheDocument();
  });

  it("shows the plain empty message without a search/filter", () => {
    renderList(listState(), page([], 0));
    expect(screen.getByText("Henüz kayıt yok")).toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination page={1} pageSize={20} total={20} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the range and moves between pages, disabling at the ends", () => {
    const onPageChange = vi.fn();
    const { rerender } = render(<Pagination page={1} pageSize={20} total={45} onPageChange={onPageChange} />);
    const previous = screen.getByRole("button", { name: i18n.t("paginationPrevious") });
    const next = screen.getByRole("button", { name: i18n.t("paginationNext") });

    expect(screen.getByText(i18n.t("paginationRange", { from: 1, to: 20, total: 45 }))).toBeInTheDocument();
    expect(previous).toBeDisabled();
    fireEvent.click(next);
    expect(onPageChange).toHaveBeenCalledWith(2);

    rerender(<Pagination page={3} pageSize={20} total={45} onPageChange={onPageChange} />);
    expect(screen.getByText(i18n.t("paginationRange", { from: 41, to: 45, total: 45 }))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: i18n.t("paginationNext") })).toBeDisabled();
  });
});
