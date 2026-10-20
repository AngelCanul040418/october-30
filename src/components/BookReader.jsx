import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react'

const PdfBook = lazy(() => import('./PdfBook.jsx'))

const backgroundStickers = [
  { src: '/sticker-fondo-1.png', className: 'stage-sticker-a' },
  { src: '/sticker-fondo-2.png', className: 'stage-sticker-b' },
  { src: '/sticker-fondo-2.png', className: 'stage-sticker-c' },
  { src: '/sticker-fondo-1.png', className: 'stage-sticker-d' },
  { src: '/sticker-fondo-2.png', className: 'stage-sticker-e' },
  { src: '/sticker-fondo-1.png', className: 'stage-sticker-f' },
  { src: '/sticker-fondo-2.png', className: 'stage-sticker-g' },
  { src: '/sticker-fondo-1.png', className: 'stage-sticker-h' },
  { src: '/sticker-fondo-2.png', className: 'stage-sticker-i' },
  { src: '/sticker-fondo-1.png', className: 'stage-sticker-j' },
  { src: '/sticker-fondo-2.png', className: 'stage-sticker-k' },
  { src: '/sticker-fondo-1.png', className: 'stage-sticker-l' },
]

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getPageWidth(width, height, pageRatio, orientation, isFullscreen) {
  const isSmallScreen = window.matchMedia('(max-width: 680px)').matches
  const availableWidth = width - (isSmallScreen ? 24 : 40)
  const spreadWidth = orientation === 'portrait' ? availableWidth : availableWidth / 2
  const fullscreenHeight = height - (isSmallScreen ? 24 : 60)
  const fullscreenPageWidth = isFullscreen ? fullscreenHeight / pageRatio : 520

  return Math.max(180, Math.min(spreadWidth, fullscreenPageWidth, 520))
}

function BookReader({
  file,
  fileName,
  bookTitle,
  bookSubtitle = '',
  bookDescription = '',
  bookAuthor = '',
  coverImage = '',
  fileSize,
  shareUrl,
  saving,
  canSave,
  onSave,
  onClose,
  onLoadError,
}) {
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageRatio, setPageRatio] = useState(1.414)
  const [orientation, setOrientation] = useState('portrait')
  const [isTurning, setIsTurning] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const [pageWidth, setPageWidth] = useState(640)
  const bookRef = useRef(null)
  const flipBookRef = useRef(null)
  const canGoNext = pageCount > 1 && pageNumber < pageCount

  useEffect(() => {
    const element = bookRef.current
    if (!element) return undefined

    const observer = new ResizeObserver(([entry]) => {
      setPageWidth(getPageWidth(
        entry.contentRect.width,
        entry.contentRect.height,
        pageRatio,
        orientation,
        document.fullscreenElement === element,
      ))
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [orientation, pageRatio])

  useEffect(() => {
    function updateFullscreenLayout() {
      setIsFullscreen(document.fullscreenElement === bookRef.current)
      window.requestAnimationFrame(() => {
        const element = bookRef.current
        if (element) {
          setPageWidth(getPageWidth(
            element.clientWidth,
            element.clientHeight,
            pageRatio,
            orientation,
            document.fullscreenElement === element,
          ))
          window.requestAnimationFrame(() => flipBookRef.current?.refreshLayout())
        }
      })
    }

    document.addEventListener('fullscreenchange', updateFullscreenLayout)
    window.addEventListener('resize', updateFullscreenLayout)
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenLayout)
      window.removeEventListener('resize', updateFullscreenLayout)
    }
  }, [orientation, pageRatio])

  useEffect(() => {
    function handleKeyDown(event) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target.isContentEditable
      ) return

      if (event.key === 'ArrowRight') {
        flipBookRef.current?.next()
      }
      if (event.key === 'ArrowLeft') {
        flipBookRef.current?.previous()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handlePageCount({ numPages, pageRatio: nextPageRatio }) {
    setPageCount(numPages)
    setPageRatio(nextPageRatio)
    setOrientation(window.matchMedia('(min-width: 680px)').matches ? 'landscape' : 'portrait')
    setPageNumber(1)
    setIsTurning(false)
  }

  function handlePageChange(nextPage, nextOrientation) {
    setPageNumber(nextPage)
    setOrientation(nextOrientation)
  }

  function downloadPdf() {
    const downloadName = fileName.split(/[\\/]/).pop() || 'libro.pdf'
    const anchor = document.createElement('a')

    if (file instanceof File) {
      const url = URL.createObjectURL(file)
      anchor.href = url
      anchor.download = downloadName
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      return
    }

    anchor.href = `${file}${file.includes('?') ? '&' : '?'}download=${encodeURIComponent(downloadName)}`
    anchor.download = downloadName
    anchor.click()
  }

  async function toggleFullscreen() {
    setFullscreenError('')
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await bookRef.current?.requestFullscreen?.()
      }
    } catch (requestError) {
      setFullscreenError(`No se pudo cambiar a pantalla completa: ${requestError.message}`)
    }
  }

  return (
    <section className={`reader-card${onClose ? '' : ' reader-card-shared'}`} aria-label="Lector de PDF">
      <div className="reader-toolbar">
        <div className="document-info">
          <span className={`document-icon${coverImage ? ' document-icon-cover' : ''}`}>
            {coverImage
              ? <img src={coverImage} alt="" />
              : <BookOpen size={18} />}
          </span>
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
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>

      {(bookSubtitle || bookDescription || bookAuthor) && !onClose && (
        <div className="shared-book-details">
          {bookSubtitle && <p className="shared-book-subtitle">{bookSubtitle}</p>}
          {bookAuthor && <p className="shared-book-author">Por {bookAuthor}</p>}
          {bookDescription && <p className="shared-book-description">{bookDescription}</p>}
        </div>
      )}

      <div className="book-stage" ref={bookRef}>
        <span className="stage-glow" />
        {!onClose && (
          <div className="stage-stickers" aria-hidden="true">
            {backgroundStickers.map((sticker) => (
              <img
                key={sticker.className}
                className={sticker.className}
                src={sticker.src}
                alt=""
              />
            ))}
          </div>
        )}
        <button
          className="page-arrow page-arrow-left"
          onClick={() => flipBookRef.current?.previous()}
          disabled={pageNumber <= 1 || isTurning}
          aria-label="Página anterior"
        >
          <ArrowLeft size={19} />
        </button>
        <Suspense fallback={<div className="page-loading"><span className="spinner" /> Preparando tu libro...</div>}>
          <PdfBook
            ref={flipBookRef}
            key={file instanceof Blob ? `${file.name}-${file.size}-${file.lastModified}` : file}
            file={file}
            pageWidth={pageWidth}
            pageHeight={pageWidth * pageRatio}
            onLoadSuccess={handlePageCount}
            onLoadError={onLoadError}
            onPageChange={handlePageChange}
            onBusyChange={setIsTurning}
          />
        </Suspense>
        <button
          className="page-arrow page-arrow-right"
          onClick={() => flipBookRef.current?.next()}
          disabled={!canGoNext || isTurning}
          aria-label="Página siguiente"
        >
          <ArrowRight size={19} />
        </button>
      </div>

      <div className="reader-controls">
        <div className="page-counter">
          <span className="current-page">
            {pageNumber.toString().padStart(2, '0')}
            {orientation === 'landscape' && pageNumber > 1 && pageNumber < pageCount
              ? `–${(pageNumber + 1).toString().padStart(2, '0')}`
              : ''}
          </span>
          <span className="page-divider">/</span>
          <span>{pageCount ? pageCount.toString().padStart(2, '0') : '--'}</span>
        </div>
        <input
          className="page-slider"
          type="range"
          min="1"
          max={Math.max(pageCount, 1)}
          value={pageNumber}
          onChange={(event) => flipBookRef.current?.goToPage(Number(event.target.value))}
          aria-label="Seleccionar página"
          style={{ '--progress': `${pageCount > 1 ? ((pageNumber - 1) / (pageCount - 1)) * 100 : 0}%` }}
        />
        <div className="control-buttons">
          <button
            className="control-button"
            onClick={() => flipBookRef.current?.previous()}
            disabled={pageNumber <= 1}
          >
            <ArrowLeft size={16} /> Anterior
          </button>
          <button
            className="control-button next-button"
            onClick={() => flipBookRef.current?.next()}
            disabled={!canGoNext}
          >
            Siguiente <ArrowRight size={16} />
          </button>
        </div>
      </div>
      {fullscreenError && <p className="metadata-load-error" role="alert">{fullscreenError}</p>}
    </section>
  )
}

export default BookReader
