import { AnimatePresence, motion } from 'motion/react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

function PdfBook({ file, pageNumber, pageWidth, onLoadSuccess, onLoadError, error }) {
  return (
    <Document
      className="pdf-document"
      file={file}
      onLoadSuccess={onLoadSuccess}
      onLoadError={onLoadError}
      loading={<div className="page-loading"><span className="spinner" /> Preparando tu libro...</div>}
      error={<div className="page-loading">{error || 'No se pudo cargar el PDF.'}</div>}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pageNumber}
          className="pdf-page-wrap"
          initial={{ opacity: 0, rotateY: pageNumber > 1 ? 16 : -16, x: pageNumber > 1 ? 18 : -18 }}
          animate={{ opacity: 1, rotateY: 0, x: 0 }}
          exit={{ opacity: 0, rotateY: pageNumber > 1 ? -12 : 12, x: pageNumber > 1 ? -14 : 14 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <Page
            pageNumber={pageNumber}
            width={pageWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={<div className="page-loading"><span className="spinner" /> Cargando página...</div>}
          />
        </motion.div>
      </AnimatePresence>
    </Document>
  )
}

export default PdfBook
