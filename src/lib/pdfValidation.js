const PDF_SIGNATURE = '%PDF-'

export const MAX_PDF_SIZE = 50 * 1024 * 1024

export async function hasPdfSignature(file) {
  const header = await file.slice(0, PDF_SIGNATURE.length).arrayBuffer()
  return new TextDecoder().decode(header) === PDF_SIGNATURE
}

export async function canOpenPdf(file, pdfjsModule) {
  const pdfjs = pdfjsModule || await import('pdfjs-dist')
  const { getDocument, GlobalWorkerOptions } = pdfjs
  if (!pdfjsModule) {
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
  }
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })

  try {
    const document = await loadingTask.promise
    const canOpen = document.numPages > 0
    if (typeof document.destroy === 'function') {
      await document.destroy()
    }
    return canOpen
  } catch (validationError) {
    await loadingTask.destroy()
    throw validationError
  }
}

export async function validatePdfFile(file, options = {}) {
  if (file.size > MAX_PDF_SIZE) {
    throw new Error('Este PDF supera el límite de 50 MB. Elige un archivo más pequeño.')
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Ese archivo no parece ser un PDF. Elige un archivo .pdf para continuar.')
  }
  if (!(await hasPdfSignature(file))) {
    throw new Error('El archivo no contiene una firma PDF válida. Elige un PDF real.')
  }
  if (!(await canOpenPdf(file, options.pdfjsModule))) {
    throw new Error('El PDF no contiene páginas legibles. Elige otro archivo.')
  }
}
