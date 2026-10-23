import assert from 'node:assert/strict'
import test from 'node:test'
import * as pdfjsModule from 'pdfjs-dist/legacy/build/pdf.mjs'
import { validatePdfFile } from '../src/lib/pdfValidation.js'

const validPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`

function pdfFile(contents, name = 'book.pdf', type = 'application/pdf') {
  return new File([contents], name, { type })
}

test('accepts a readable PDF with a PDF extension', async () => {
  await assert.doesNotReject(() => validatePdfFile(pdfFile(validPdf), { pdfjsModule }))
})

test('rejects a file without a PDF signature', async () => {
  await assert.rejects(
    () => validatePdfFile(pdfFile('not a pdf')),
    { message: 'El archivo no contiene una firma PDF válida. Elige un PDF real.' },
  )
})

test('rejects a PDF signature that PDF.js cannot read', async () => {
  await assert.rejects(
    () => validatePdfFile(pdfFile('%PDF-1.4\n%%EOF'), { pdfjsModule }),
    /No se pudo validar el PDF|Invalid PDF structure|InvalidPDFException/i,
  )
})

test('rejects a non-PDF file even when its contents start like a PDF', async () => {
  await assert.rejects(
    () => validatePdfFile(pdfFile(validPdf, 'book.txt', 'text/plain')),
    { message: 'Ese archivo no parece ser un PDF. Elige un archivo .pdf para continuar.' },
  )
})
