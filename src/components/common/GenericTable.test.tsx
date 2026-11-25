import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../../lib/i18n";
import GenericTable, { type GenericTableColumn } from "./GenericTable";

interface Row {
  id: string;
  name: string;
}

const rows: Row[] = [
  { id: "a", name: "VEA Demo Galeri" },
  { id: "b", name: "Başka Galeri" },
];

// Same shape as OrganizationList: single expandedId, an action button in a
// cell that must NOT toggle the row.
function Harness({ onEdit }: { onEdit: (row: Row) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const columns: GenericTableColumn<Row>[] = [
    { key: "name", header: "Kurum", render: (row) => row.name },
    {
      key: "actions",
      header: "İşlemler",
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(row);
          }}
        >
          {`edit-${row.id}`}
        </button>
      ),
    },
  ];
  return (
    <GenericTable
      columns={columns}
      data={rows}
      getRowKey={(row) => row.id}
      emptyMessage="boş"
      expandable={{
        isExpanded: (row) => expandedId === row.id,
        onToggle: (row) => setExpandedId(expandedId === row.id ? null : row.id),
        renderExpanded: (row) => <p>{`details-${row.id}`}</p>,
      }}
    />
  );
}

describe("GenericTable expandable rows", () => {
  it("expands and collapses a row with the chevron button (exactly one toggle per click)", () => {
    render(<Harness onEdit={() => {}} />);
    const [chevronA] = screen.getAllByRole("button", { expanded: false });

    fireEvent.click(chevronA);
    expect(screen.getByText("details-a")).toBeInTheDocument();
    expect(chevronA).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(chevronA);
    expect(screen.queryByText("details-a")).not.toBeInTheDocument();
    expect(chevronA).toHaveAttribute("aria-expanded", "false");
  });

  it("expands a row when the row itself is clicked", () => {
    render(<Harness onEdit={() => {}} />);
    fireEvent.click(screen.getByText("Başka Galeri"));
    expect(screen.getByText("details-b")).toBeInTheDocument();
  });

  it("keeps a single row open at a time with a single expandedId", () => {
    render(<Harness onEdit={() => {}} />);
    fireEvent.click(screen.getByText("VEA Demo Galeri"));
    fireEvent.click(screen.getByText("Başka Galeri"));
    expect(screen.queryByText("details-a")).not.toBeInTheDocument();
    expect(screen.getByText("details-b")).toBeInTheDocument();
  });

  it("an action button that stops propagation runs without toggling the row", () => {
    const onEdit = vi.fn();
    render(<Harness onEdit={onEdit} />);
    fireEvent.click(screen.getByText("edit-a"));
    expect(onEdit).toHaveBeenCalledWith(rows[0]);
    expect(screen.queryByText("details-a")).not.toBeInTheDocument();
  });

  it("labels the chevron for screen readers", () => {
    render(<Harness onEdit={() => {}} />);
    expect(screen.getAllByRole("button", { expanded: false })[0]).toHaveAccessibleName();
  });
});

describe("GenericTable onRowClick", () => {
  it("calls onRowClick with the row, but not when a stopPropagation button in it is clicked", () => {
    const onRowClick = vi.fn();
    const onEdit = vi.fn();
    const columns: GenericTableColumn<Row>[] = [
      { key: "name", header: "Kurum", render: (row) => row.name },
      {
        key: "actions",
        header: "İşlemler",
        render: (row) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(row);
            }}
          >
            {`edit-${row.id}`}
          </button>
        ),
      },
    ];
    render(
      <GenericTable columns={columns} data={rows} getRowKey={(row) => row.id} emptyMessage="boş" onRowClick={onRowClick} />,
    );

    fireEvent.click(screen.getByText("Başka Galeri"));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);

    fireEvent.click(screen.getByText("edit-a"));
    expect(onEdit).toHaveBeenCalledWith(rows[0]);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});
