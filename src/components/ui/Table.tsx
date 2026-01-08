import type { ReactNode } from 'react'
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'

interface Column<T> {
  key: string
  header: string
  render?: (item: T) => ReactNode
  className?: string
  sortable?: boolean
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  emptyMessage?: string
  isLoading?: boolean
  onRowClick?: (item: T) => void
  sortField?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (field: string) => void
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'データがありません',
  isLoading = false,
  onRowClick,
  sortField,
  sortDirection,
  onSort,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="animate-pulse">
          <div className="h-12 bg-gray-100 border-b border-border" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 border-b border-border last:border-0">
              <div className="h-full flex items-center px-6">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Render header cell with optional sort functionality
  const renderHeaderCell = (column: Column<T>) => {
    const isSortable = column.sortable && onSort
    const isActive = sortField === column.key

    if (isSortable) {
      return (
        <th
          key={column.key}
          onClick={() => onSort(column.key)}
          className={`px-6 py-3 text-left text-sm font-semibold cursor-pointer select-none transition-colors hover:bg-gray-100 ${
            isActive ? 'text-primary' : 'text-text'
          } ${column.className || ''}`}
        >
          <div className="flex items-center gap-1">
            {column.header}
            {isActive ? (
              sortDirection === 'asc' ? (
                <ChevronUpIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )
            ) : (
              <span className="w-4 h-4 opacity-0 group-hover:opacity-50">
                <ChevronUpIcon className="w-4 h-4" />
              </span>
            )}
          </div>
        </th>
      )
    }

    return (
      <th
        key={column.key}
        className={`px-6 py-3 text-left text-sm font-semibold text-text ${column.className || ''}`}
      >
        {column.header}
      </th>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-border">
              {columns.map(renderHeaderCell)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-text-light">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  onClick={() => onRowClick?.(item)}
                  className={`
                    hover:bg-gray-50 transition-colors
                    ${onRowClick ? 'cursor-pointer' : ''}
                  `}
                >
                  {columns.map((column) => (
                    <td
                      key={`${keyExtractor(item)}-${column.key}`}
                      className={`px-6 py-4 text-sm text-text ${column.className || ''}`}
                    >
                      {column.render
                        ? column.render(item)
                        : (item as Record<string, unknown>)[column.key]?.toString() || '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
