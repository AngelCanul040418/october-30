import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  Maximize2,
  X,
} from 'lucide-react'

const PdfBook = lazy(() => import('./PdfBook.jsx'))

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function BookReader({
  file,
  fileName,
  bookTitle,
  fileSize,
  shareUrl,
  saving,
  canSave,
  onSave,
  onClose,
  error,
  onLoadError,
}) {
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageWidth, setPageWidth] = useState(640)
  const bookRef = useRef(null)

  useEffect(() => {
    const element = bookRef.current
    if (!element) return undefined

    const observer = new ResizeObserver(([entry]) => {
      setPageWidth(Math.max(240, Math.min(entry.contentRect.width - 40, 720)))
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    function handleKeyDown(event) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target.isContentEditable
      ) return

      if (event.key === 'ArrowRight') {
        setPageNumber((current) => Math.min(current + 1, pageCount || current + 1))
      }
      if (event.key === 'ArrowLeft') {
        setPageNumber((current) => Math.max(current - 1, 1))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pageCount])

  function handlePageCount({ numPages }) {
    setPageCount(numPages)
    setPageNumber((current) => Math.min(current, numPages))
  }

  function downloadPdf() {
    if (file instanceof File) {
      const url = URL.createObjectURL(file)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      return
    }

    window.open(file, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className={`reader-card${onClose ? '' : ' reader-card-shared'}`} aria-label="Lector de PDF">
      <div className="reader-toolbar">
        <div className="document-info">
          <span className="document-icon"><FileText size={18} /></span>
          <div className="document-copy">
            <span className="document-name" title={bookTitle || fileName}>{bookTitle || fileName}</span>
            <span className="document-meta">
              {pageCount ? `${pageCount} páginas` : 'Abriendo documento'}
              {fileSize ? ` · ${formatFileSize(fileSize)}` : ''}
            </span>
          </div>
          {shareUrl && (
            <span className="preview-badge">Enlace listo para compartir</span>
          )}
        </div>
        <div className="toolbar-actions">
          {onClose && (
            <button className="icon-button" onClick={onClose} aria-label="Cerrar PDF" title="Cerrar PDF">
              <X size={18} />
            </button>
          )}
          {onSave && (
            <button
              className="save-book-button"
              onClick={onSave}
              disabled={saving || Boolean(shareUrl) || !canSave}
            >
              {saving ? 'Guardando…' : shareUrl ? 'Guardado' : 'Guardar y crear enlace'}
            </button>
          )}
          <button className="icon-button" onClick={downloadPdf} aria-label="Descargar PDF" title="Descargar PDF">
            <Download size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => bookRef.current?.requestFullscreen?.()}
            aria-label="Ver en pantalla completa"
            title="Pantalla completa"
          >
            <Maximize2 size={18} />
          </button>
        </div>
      </div>

      <div className="book-stage" ref={bookRef}>
        <span className="stage-glow" />
        <button
          className="page-arrow page-arrow-left"
          onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
          disabled={pageNumber <= 1}
          aria-label="Página anterior"
        >
          <ArrowLeft size={19} />
        </button>
        <Suspense fallback={<div className="page-loading"><span className="spinner" /> Preparando tu libro...</div>}>
          <PdfBook
            key={file instanceof Blob ? `${file.name}-${file.size}-${file.lastModified}` : file}
            file={file}
            pageNumber={pageNumber}
            pageWidth={pageWidth}
            onLoadSuccess={handlePageCount}
            onLoadError={onLoadError}
            error={error}
          />
        </Suspense>
        <button
          className="page-arrow page-arrow-right"
          onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}
          disabled={!pageCount || pageNumber >= pageCount}
          aria-label="Página siguiente"
        >
          <ArrowRight size={19} />
        </button>
      </div>

      <div className="reader-controls">
        <div className="page-counter">
          <span className="current-page">{pageNumber.toString().padStart(2, '0')}</span>
          <span className="page-divider">/</span>
          <span>{pageCount ? pageCount.toString().padStart(2, '0') : '--'}</span>
        </div>
        <input
          className="page-slider"
          type="range"
          min="1"
          max={Math.max(pageCount, 1)}
          value={pageNumber}
          onChange={(event) => setPageNumber(Number(event.target.value))}
          aria-label="Seleccionar página"
          style={{ '--progress': `${pageCount > 1 ? ((pageNumber - 1) / (pageCount - 1)) * 100 : 0}%` }}
        />
        <div className="control-buttons">
          <button
            className="control-button"
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
            disabled={pageNumber <= 1}
          >
            <ArrowLeft size={16} /> Anterior
          </button>
          <button
            className="control-button next-button"
            onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}
            disabled={!pageCount || pageNumber >= pageCount}
          >
            Siguiente <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  )
}

export default BookReader
