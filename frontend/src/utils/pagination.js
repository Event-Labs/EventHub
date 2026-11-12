/**
 * Generates pagination page numbers and ellipsis markers.
 * If totalPages <= 5, all page numbers are displayed.
 * Otherwise, collapses excessive numbers with ellipsis:
 * - Near start (page <= 3): [1, 2, 3, 'ellipsis', totalPages] (e.g. 1 2 3 ... 11)
 * - Near end (page >= totalPages - 2): [1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages] (e.g. 1 ... 9 10 11)
 * - Middle: [1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', totalPages] (e.g. 1 ... 4 5 6 ... 11)
 */
export function getPaginationItems(currentPage, totalPages) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 'ellipsis', totalPages]
  }

  if (currentPage >= totalPages - 2) {
    return [1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages]
  }

  return [1, 'ellipsis-start', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-end', totalPages]
}

