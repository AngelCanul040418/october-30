import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

function renderPage(pdf, pageNumber, width) {
  return pdf.getPage(pageNumber).then(async (page) => {
    const baseViewport = page.getViewport({ scale: 1 })
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const scale = (width / baseViewport.width) * pixelRatio
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('No se pudo preparar el lienzo de la página.')
    }

    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, canvasContext: context, viewport }).promise

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error('No se pudo preparar la imagen de la página.'))
      })
    })

    page.cleanup()
    return {
      url: URL.createObjectURL(blob),
      width: viewport.width / pixelRatio,
      height: viewport.height / pixelRatio,
    }
  })
}

function PdfBook({ file, pageNumber, pageWidth, onLoadSuccess, onLoadError, error }) {
  const [pdf, setPdf] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [visiblePage, setVisiblePage] = useState(1)
  const [currentAsset, setCurrentAsset] = useState(null)
  const [turn, setTurn] = useState(null)
  const [loadError, setLoadError] = useState('')
  const cacheRef = useRef(new Map())
  const callbacksRef = useRef({ onLoadSuccess, onLoadError })
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    callbacksRef.current = { onLoadSuccess, onLoadError }
  }, [onLoadError, onLoadSuccess])

  const getPageAsset = useCallback((document, page, width) => {
    const key = `${page}:${width}`
    const cachedAsset = cacheRef.current.get(key)
    if (cachedAsset) return cachedAsset

    const assetPromise = renderPage(document, page, width)
    cacheRef.current.set(key, assetPromise)
    assetPromise.catch(() => {
      if (cacheRef.current.get(key) === assetPromise) cacheRef.current.delete(key)
    })
    return assetPromise
  }, [])

  const pruneCache = useCallback((centerPage, width, protectedUrls = []) => {
    for (const [key, assetPromise] of cacheRef.current) {
      const [cachedPage, cachedWidth] = key.split(':').map(Number)
      if (cachedWidth === width && Math.abs(cachedPage - centerPage) <= 2) continue

      cacheRef.current.delete(key)
      assetPromise
        .then((asset) => {
          if (!protectedUrls.includes(asset.url)) URL.revokeObjectURL(asset.url)
        })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    let active = true
    let loadingTask
    let loadedDocument
    const assetCache = cacheRef.current

    for (const assetPromise of assetCache.values()) {
      assetPromise
        .then((asset) => URL.revokeObjectURL(asset.url))
        .catch(() => {})
    }
    assetCache.clear()

    async function loadPdf() {
      try {
        let source = file
        if (file instanceof Blob) {
          source = { data: new Uint8Array(await file.arrayBuffer()) }
        } else {
          source = { url: file }
        }

        loadingTask = getDocument(source)
        loadedDocument = await loadingTask.promise
        if (!active) {
          await loadedDocument.destroy()
          return
        }

        setPdf(loadedDocument)
        setPageCount(loadedDocument.numPages)
        callbacksRef.current.onLoadSuccess({ numPages: loadedDocument.numPages })
      } catch (loadError) {
        if (!active) return
        setLoadError('No se pudo abrir el PDF. Comprueba que no esté dañado o protegido.')
        callbacksRef.current.onLoadError(loadError)
      }
    }

    loadPdf()

    return () => {
      active = false
      if (loadedDocument) loadedDocument.destroy().catch(() => {})
      else if (loadingTask) loadingTask.destroy().catch(() => {})
      for (const assetPromise of assetCache.values()) {
        assetPromise
          .then((asset) => URL.revokeObjectURL(asset.url))
          .catch(() => {})
      }
      assetCache.clear()
    }
  }, [file])

  useEffect(() => {
    if (!pdf) return undefined

    let active = true
    getPageAsset(pdf, visiblePage, pageWidth)
      .then((asset) => {
        if (active) setCurrentAsset(asset)
      })
      .catch((renderError) => {
        if (!active) return
        setLoadError('No se pudo preparar la página del PDF.')
        callbacksRef.current.onLoadError(renderError)
      })

    return () => {
      active = false
    }
  }, [getPageAsset, pageWidth, pdf, visiblePage])

  useEffect(() => {
    if (!pdf) return undefined

    let active = true
    for (const page of [visiblePage - 1, visiblePage + 1]) {
      if (page < 1 || page > pageCount) continue
      getPageAsset(pdf, page, pageWidth).catch((renderError) => {
        if (active) callbacksRef.current.onLoadError(renderError)
      })
    }

    return () => {
      active = false
    }
  }, [getPageAsset, pageCount, pageWidth, pdf, visiblePage])

  useEffect(() => {
    if (!pdf || !currentAsset || turn || pageNumber === visiblePage) return undefined

    let active = true
    const direction = pageNumber > visiblePage ? 1 : -1
    const fromPage = visiblePage
    const targetPage = pageNumber

    getPageAsset(pdf, targetPage, pageWidth)
      .then((targetAsset) => {
        if (!active) return
        setTurn({
          key: `${fromPage}-${targetPage}-${Date.now()}`,
          fromAsset: currentAsset,
          toAsset: targetAsset,
          toPage: targetPage,
          direction,
        })
      })
      .catch((renderError) => {
        if (!active) return
        setLoadError('No se pudo preparar la página siguiente.')
        callbacksRef.current.onLoadError(renderError)
      })

    return () => {
      active = false
    }
  }, [currentAsset, getPageAsset, pageNumber, pageWidth, pdf, turn, visiblePage])

  useEffect(() => {
    if (!pdf || !currentAsset || turn) return
    pruneCache(visiblePage, pageWidth, [currentAsset.url])
  }, [currentAsset, pageWidth, pdf, pruneCache, turn, visiblePage])

  function finishTurn(completedTurn) {
    setCurrentAsset(completedTurn.toAsset)
    setVisiblePage(completedTurn.toPage)
    setTurn((currentTurn) => (
      currentTurn?.key === completedTurn.key ? null : currentTurn
    ))
    pruneCache(completedTurn.toPage, pageWidth, [
      completedTurn.fromAsset.url,
      completedTurn.toAsset.url,
    ])
  }

  const baseAsset = turn?.toAsset ?? currentAsset

  return (
    <div className="pdf-document">
      {baseAsset ? (
        <div
          className="pdf-page-clip"
          style={{ width: baseAsset.width, height: baseAsset.height }}
        >
          <div className="pdf-page-stack">
            <img
              className="pdf-current-page"
              src={baseAsset.url}
              alt={`Página ${turn ? pageNumber : visiblePage}`}
              draggable="false"
            />
            {turn && (
              <motion.div
                key={turn.key}
                className="page-turn-sheet"
                style={{
                  width: turn.fromAsset.width,
                  height: turn.fromAsset.height,
                  transformOrigin: 'left center',
                }}
                initial={{ rotateY: 0 }}
                animate={{ rotateY: turn.direction > 0 ? -180 : 180 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.72,
                  ease: [0.42, 0, 0.22, 1],
                }}
                onAnimationComplete={() => finishTurn(turn)}
              >
                <div className="page-face page-face-front">
                  <img src={turn.fromAsset.url} alt="" draggable="false" />
                </div>
                <div className="page-face page-face-back">
                  <img src={turn.toAsset.url} alt="" draggable="false" />
                </div>
              </motion.div>
            )}
          </div>
        </div>
      ) : (
        <div className="page-loading" role="status">
          <span className="spinner" />
          {loadError || error || 'Preparando el libro...'}
        </div>
      )}
    </div>
  )
}

export default PdfBook
