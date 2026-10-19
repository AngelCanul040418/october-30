import { motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

function PdfBook({ file, pageNumber, pageWidth, onLoadSuccess, onLoadError, error }) {
  const previousPageRef = useRef(pageNumber)
  const [turn, setTurn] = useState(null)
  const prefersReducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    const previousPage = previousPageRef.current
    previousPageRef.current = pageNumber

    if (previousPage !== pageNumber) {
      setTurn({
        from: previousPage,
        direction: pageNumber > previousPage ? 1 : -1,
        key: `${previousPage}-${pageNumber}`,
      })
    }
  }, [pageNumber])

  return (
    <Document
      className="pdf-document"
      file={file}
      onLoadSuccess={onLoadSuccess}
      onLoadError={onLoadError}
      loading={<div className="page-loading"><span className="spinner" /> Preparando tu libro...</div>}
      error={<div className="page-loading">{error || 'No se pudo cargar el PDF.'}</div>}
    >
      <div className="pdf-page-stack">
        <div className="pdf-current-page">
          <Page
            pageNumber={pageNumber}
            width={pageWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={<div className="page-loading"><span className="spinner" /> Cargando página...</div>}
          />
        </div>
        {turn && (
          <motion.div
            key={turn.key}
            className="page-turn-sheet"
            initial={{ rotateY: 0 }}
            animate={{ rotateY: turn.direction > 0 ? -180 : 180 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.68,
              ease: [0.42, 0, 0.22, 1],
            }}
            onAnimationComplete={() => {
              setTurn((currentTurn) => (
                currentTurn?.key === turn.key ? null : currentTurn
              ))
            }}
          >
            <div className="page-face page-face-front">
              <Page
                pageNumber={turn.from}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
            <div className="page-face page-face-back">
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          </motion.div>
        )}
      </div>
    </Document>
  )
}

export default PdfBook
