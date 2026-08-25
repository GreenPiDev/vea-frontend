import { Fragment, type ReactNode } from 'react';

export interface GenericTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

// Opt-in per-row expansion (accordion-style, but living inside the table
// itself — a toggle column + a full-width sub-row — instead of a table
// nested inside a separate accordion list). Whether more than one row can
// be expanded at once is entirely up to the caller's `isExpanded`/`onToggle`
// (e.g. ExhibitionStatsList.tsx keeps a single `expandedId`, so opening one
// row closes the previous one).
export interface GenericTableExpandable<T> {
  isExpanded: (row: T) => boolean;
  onToggle: (row: T) => void;
  renderExpanded: (row: T) => ReactNode;
}

interface GenericTableProps<T> {
  columns: GenericTableColumn<T>[];
  data: T[] | undefined;
  getRowKey: (row: T) => string;
  isLoading?: boolean;
  emptyMessage: string;
  expandable?: GenericTableExpandable<T>;
}

// Shared read/write table shell for panel screens (curator/artist/superadmin
// dashboards) — columns own their own cell rendering (badges, inline forms,
// buttons, ...) via `render`, this component only owns the table chrome
// (borders, header style, empty/loading state, optional row expansion).
// OrgOfferTable.tsx is the first consumer; other panel tables migrate to
// this incrementally, not in one pass.
export default function GenericTable<T>({ columns, data, getRowKey, isLoading, emptyMessage, expandable }: GenericTableProps<T>) {
  if (isLoading) return null;

  if (!data || data.length === 0) {
    return <p className="text-sm text-brand-200">{emptyMessage}</p>;
  }

  const columnCount = columns.length + (expandable ? 1 : 0);

  return (
    // Outer wrapper has no `overflow` of its own, so it keeps flexbox's
    // "automatic minimum size" content protection inside PanelLayout's
    // flex-column sections — an item with overflow: visible is never shrunk
    // below its content height.
    //
    // The inner div needs overflow-x-auto for narrow viewports, but plain
    // overflow-x-auto (leaving overflow-y unset) makes the browser compute
    // overflow-y as auto too (CSS spec: one non-visible axis forces the
    // other off 'visible'). That turned this div into a real *scroll*
    // container — and action-column Tooltip.tsx labels are
    // position:absolute + top-full, so on the table's last row that label
    // pokes a few px below the table's own bottom edge even while invisible
    // (opacity-0). An absolutely positioned descendant still counts toward
    // its nearest scrolling ancestor's scrollHeight, so that invisible
    // sliver alone made this div "need" scrolling — confirmed by measuring
    // scrollHeight > clientHeight by exactly the tooltip's own height.
    // overflow-y-clip keeps the horizontal auto-scroll but never creates a
    // vertical scroll container in the first place, so there's nothing for
    // that phantom sliver to trigger. Action-button tooltips inside table
    // rows use Tooltip's placement="top" (see ArtworkList/ExhibitionList's
    // ActionButton) specifically so they never poke past this box's bottom
    // edge in the first place — no reserved padding needed here.
    <div className="w-full">
      <div className="w-full overflow-x-auto overflow-y-clip rounded-lg bg-brand-50 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-brand-200 text-xs uppercase tracking-wide text-brand-600">
              {expandable && <th className="w-10 px-4 py-3" aria-hidden="true" />}
              {columns.map((column) => (
                <th key={column.key} className={`px-4 py-3 font-medium ${column.headerClassName ?? ''}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const rowKey = getRowKey(row);
              const isExpanded = expandable?.isExpanded(row) ?? false;

              return (
                <Fragment key={rowKey}>
                  <tr
                    className={`border-b border-brand-100 last:border-0 ${expandable ? 'cursor-pointer hover:bg-brand-100/60' : ''}`}
                    onClick={expandable ? () => expandable.onToggle(row) : undefined}
                  >
                    {expandable && (
                      <td className="px-4 py-3 text-brand-500">
                        <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.key} className={`px-4 py-3 ${column.cellClassName ?? ''}`}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                  {expandable && isExpanded && (
                    <tr className="border-b border-brand-100 last:border-0">
                      <td colSpan={columnCount} className="bg-brand-100/50 px-4 py-3">
                        {expandable.renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
