'use client'

type PaginationControlsProps = {
  page: number
  pageSize: number
  totalItems: number
  itemLabel?: string
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  pageSizeOptions?: number[]
}

export function PaginationControls({
  page,
  pageSize,
  totalItems,
  itemLabel = 'items',
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 30, 50, 100],
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(page, totalPages)
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = totalItems === 0 ? 0 : Math.min(totalItems, currentPage * pageSize)

  if (totalItems <= 0) return null

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginTop:16, flexWrap:'wrap' as const }}>
      <div style={{ fontSize:13, color:'#6b7fa3' }}>
        Showing <strong style={{ color:'#023c62' }}>{start}-{end}</strong> of <strong style={{ color:'#023c62' }}>{totalItems}</strong> {itemLabel}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' as const }}>
        <label style={{ fontSize:12, color:'#6b7fa3', display:'inline-flex', alignItems:'center', gap:8 }}>
          <span>Per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            style={{ border:'1px solid #dce8f0', borderRadius:8, padding:'7px 10px', fontSize:13, background:'#fff', color:'#023c62' }}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          style={{ padding:'8px 12px', border:'1px solid #dce8f0', borderRadius:8, fontSize:13, background:'#fff', color:'#023c62', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', opacity: currentPage <= 1 ? 0.45 : 1 }}
        >
          Prev
        </button>
        <div style={{ minWidth:72, textAlign:'center', fontSize:13, color:'#023c62', fontWeight:700 }}>
          {currentPage} / {totalPages}
        </div>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={{ padding:'8px 12px', border:'1px solid #dce8f0', borderRadius:8, fontSize:13, background:'#fff', color:'#023c62', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.45 : 1 }}
        >
          Next
        </button>
      </div>
    </div>
  )
}
