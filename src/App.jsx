import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  FileText,
  Maximize2,
  Upload,
  X,
} from 'lucide-react'
import './styles/App.css'

const PdfBook = lazy(() => import('./components/PdfBook.jsx'))

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function App() {
  const [file, setFile] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [pageWidth, setPageWidth] = useState(640)
  const uploadRef = useRef(null)
  const bookRef = useRef(null)

  useEffect(() => {
    const element = bookRef.current
    if (!element) return undefined

    const observer = new ResizeObserver(([entry]) => {
      setPageWidth(Math.max(240, Math.min(entry.contentRect.width - 40, 720)))
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [file])

  useEffect(() => {
    if (!file) return undefined

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
  }, [file, pageCount])

  function selectFile(nextFile) {
    if (!nextFile) return
    if (nextFile.size > 50 * 1024 * 1024) {
      setError('Este PDF supera el límite de 50 MB. Elige un archivo más pequeño.')
      return
    }

    const isPdf =
      nextFile.type === 'application/pdf' ||
      nextFile.name.toLowerCase().endsWith('.pdf')

    if (!isPdf) {
      setError('Ese archivo no parece ser un PDF. Elige un archivo .pdf para continuar.')
      return
    }

    setFile(nextFile)
    setPageCount(0)
    setPageNumber(1)
    setError('')
  }

  function handleFileChange(event) {
    selectFile(event.target.files?.[0])
    event.target.value = ''
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    selectFile(event.dataTransfer.files?.[0])
  }

  function handlePageCount({ numPages }) {
    setPageCount(numPages)
    setPageNumber((current) => Math.min(current, numPages))
  }

  function handleDocumentError() {
    setError('No pudimos abrir este PDF. Comprueba que el archivo no esté dañado o protegido.')
    setFile(null)
  }

  function downloadPdf() {
    if (!file) return
    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function openFullscreen() {
    bookRef.current?.requestFullscreen?.()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Folio, inicio">
          <span className="brand-mark"><BookOpen size={19} strokeWidth={2.2} /></span>
          <span>folio<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-note">
          <span className="status-dot" />
          Tu espacio de lectura
        </div>
      </header>

      <main className="main-content">
        <section className="intro">
          <p className="eyebrow"><span /> LECTURA, A TU MANERA</p>
          <h1>Un buen PDF merece<br className="desktop-break" /> pasar sus páginas.</h1>
          <p className="intro-copy">
            Convierte cualquier documento en una experiencia de lectura más cercana a un libro.
          </p>
        </section>

        {!file ? (
          <section
            className={`upload-card${isDragging ? ' is-dragging' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false)
            }}
            onDrop={handleDrop}
          >
            <div className="upload-illustration">
              <div className="upload-paper"><FileText size={27} strokeWidth={1.7} /></div>
              <span className="upload-spark spark-one" />
              <span className="upload-spark spark-two" />
            </div>
            <h2>Tu próximo libro empieza aquí</h2>
            <p className="upload-description">Suelta tu PDF en esta ventana o búscalo en tu dispositivo.</p>
            <button className="primary-button" onClick={() => uploadRef.current?.click()}>
              <Upload size={17} />
              Elegir un PDF
            </button>
            <input
              ref={uploadRef}
              className="visually-hidden"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              aria-label="Elegir un archivo PDF"
            />
            <p className="file-hint"><Check size={14} /> Tus archivos se abren aquí, en tu navegador.</p>
            {error && <p className="error-message" role="alert">{error}</p>}
          </section>
        ) : (
          <section className="reader-card" aria-label="Lector de PDF">
            <div className="reader-toolbar">
              <div className="document-info">
                <span className="document-icon"><FileText size={18} /></span>
                <div className="document-copy">
                  <span className="document-name" title={file.name}>{file.name}</span>
                  <span className="document-meta">
                    {pageCount ? `${pageCount} páginas` : 'Abriendo documento'} · {formatFileSize(file.size)}
                  </span>
                </div>
              </div>
              <div className="toolbar-actions">
                <button className="icon-button" onClick={downloadPdf} aria-label="Descargar PDF" title="Descargar PDF">
                  <Download size={18} />
                </button>
                <button className="icon-button" onClick={openFullscreen} aria-label="Ver en pantalla completa" title="Pantalla completa">
                  <Maximize2 size={18} />
                </button>
                <button className="icon-button close-button" onClick={() => setFile(null)} aria-label="Cerrar PDF" title="Cerrar PDF">
                  <X size={19} />
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
                  file={file}
                  pageNumber={pageNumber}
                  pageWidth={pageWidth}
                  onLoadSuccess={handlePageCount}
                  onLoadError={handleDocumentError}
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
        )}

        <footer className="page-footer">
          <span>Hecho para leer sin prisa.</span>
          <span className="footer-divider">·</span>
          <span>PDF hasta 50 MB</span>
        </footer>
      </main>
    </div>
  )
}

export default App
