import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import HTMLFlipBook from 'react-pageflip'
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
    page.cleanup()

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error('No se pudo preparar la imagen de la página.'))
      }, 'image/jpeg', 0.88)
    })

    return {
      url: URL.createObjectURL(blob),
      width: viewport.width / pixelRatio,
      height: viewport.height / pixelRatio,
    }
  })
}

const FlipPage = forwardRef(function FlipPage(
  { pageIndex, nodesRef, assetsRef },
  forwardedRef,
) {
  const setRef = useCallback((node) => {
    const image = node?.querySelector('img')
    const asset = assetsRef.current.get(pageIndex + 1)

    if (node) {
      nodesRef.current[pageIndex] = node
      if (image && asset) image.src = asset.url
    } else {
      delete nodesRef.current[pageIndex]
    }

    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }, [assetsRef, forwardedRef, nodesRef, pageIndex])

  return (
    <div
      ref={setRef}
      className="flipbook-page"
      data-density={pageIndex === 0 ? 'hard' : 'soft'}
    >
      <img alt="" draggable="false" />
    </div>
  )
})

const PdfBook = forwardRef(function PdfBook(
  {
    file,
    pageWidth,
    pageHeight,
    onLoadSuccess,
    onLoadError,
    onPageChange,
    onBusyChange,
  },
  forwardedRef,
) {
  const [pdf, setPdf] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const cacheRef = useRef(new Map())
  const pageAssetsRef = useRef(new Map())
  const pageNodesRef = useRef([])
  const bookRef = useRef(null)
  const pageIndexRef = useRef(0)
  const orientationRef = useRef('portrait')
  const busyRef = useRef(false)
  const callbacksRef = useRef({ onLoadSuccess, onLoadError, onPageChange, onBusyChange })

  useEffect(() => {
    callbacksRef.current = { onLoadSuccess, onLoadError, onPageChange, onBusyChange }
  }, [onBusyChange, onLoadError, onLoadSuccess, onPageChange])

  const applyPageAsset = useCallback((pageNumber, asset) => {
    pageAssetsRef.current.set(pageNumber, asset)
    const image = pageNodesRef.current[pageNumber - 1]?.querySelector('img')
    if (image && image.src !== asset.url) image.src = asset.url
  }, [])

  const getPageAsset = useCallback((document, pageNumber, width) => {
    const key = `${pageNumber}:${Math.round(width)}`
    const cached = cacheRef.current.get(key)
    if (cached) return cached

    const assetPromise = renderPage(document, pageNumber, width)
    cacheRef.current.set(key, assetPromise)
    assetPromise.catch(() => {
      if (cacheRef.current.get(key) === assetPromise) cacheRef.current.delete(key)
    })
    return assetPromise
  }, [])

  const preparePages = useCallback(async (document, pageNumbers, width = pageWidth) => {
    const uniquePages = [...new Set(pageNumbers)]
      .filter((pageNumber) => pageNumber >= 1 && pageNumber <= document.numPages)

    const assets = await Promise.all(
      uniquePages.map(async (pageNumber) => ({
        pageNumber,
        asset: await getPageAsset(document, pageNumber, width),
      })),
    )

    for (const { pageNumber, asset } of assets) {
      applyPageAsset(pageNumber, asset)
    }
  }, [applyPageAsset, getPageAsset, pageWidth])

  const pruneCache = useCallback((centerPage) => {
    for (const [key, assetPromise] of cacheRef.current) {
      const [cachedPage] = key.split(':').map(Number)
      if (Math.abs(cachedPage - centerPage) <= 4) continue

      cacheRef.current.delete(key)
      assetPromise.then((asset) => {
        if (pageAssetsRef.current.get(cachedPage)?.url === asset.url) {
          pageAssetsRef.current.delete(cachedPage)
          const image = pageNodesRef.current[cachedPage - 1]?.querySelector('img')
          if (image?.src === asset.url) image.removeAttribute('src')
        }
        URL.revokeObjectURL(asset.url)
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    let active = true
    let loadingTask
    let loadedDocument
    const assetCache = cacheRef.current
    const pageAssets = pageAssetsRef.current

    async function loadPdf() {
      try {
        const source = file instanceof Blob
          ? { data: new Uint8Array(await file.arrayBuffer()) }
          : { url: file }

        loadingTask = getDocument(source)
        loadedDocument = await loadingTask.promise
        const firstPage = await loadedDocument.getPage(1)
        const firstViewport = firstPage.getViewport({ scale: 1 })
        firstPage.cleanup()

        if (!active) {
          await loadedDocument.destroy()
          return
        }

        const count = loadedDocument.numPages
        setPdf(loadedDocument)
        setPageCount(count)
        callbacksRef.current.onLoadSuccess({
          numPages: count,
          pageRatio: firstViewport.height / firstViewport.width,
        })
      } catch (documentError) {
        if (!active) return
        setLoadError('No se pudo abrir el PDF. Comprueba que no esté dañado o protegido.')
        callbacksRef.current.onLoadError(documentError)
      }
    }

    loadPdf()

    return () => {
      active = false
      if (loadedDocument) loadedDocument.destroy().catch(() => {})
      else if (loadingTask) loadingTask.destroy().catch(() => {})
      for (const assetPromise of assetCache.values()) {
        assetPromise.then((asset) => URL.revokeObjectURL(asset.url)).catch(() => {})
      }
      assetCache.clear()
      pageAssets.clear()
      pageNodesRef.current = []
    }
  }, [file])

  useEffect(() => {
    if (!pdf) return undefined

    let active = true
    setIsReady(false)
    preparePages(pdf, [1, 2, 3, 4, 5])
      .then(() => {
        if (active) setIsReady(true)
      })
      .catch((renderError) => {
        if (!active) return
        setLoadError('No se pudieron preparar las páginas iniciales.')
        callbacksRef.current.onLoadError(renderError)
      })

    return () => {
      active = false
    }
  }, [pageWidth, pdf, preparePages])

  const pages = useMemo(() => {
    if (!isReady) return []

    return Array.from({ length: pageCount }, (_, pageIndex) => (
      <FlipPage
        key={pageIndex}
        pageIndex={pageIndex}
        nodesRef={pageNodesRef}
        assetsRef={pageAssetsRef}
      />
    ))
  }, [isReady, pageCount])

  const updatePage = useCallback((pageIndex, orientation = orientationRef.current) => {
    pageIndexRef.current = pageIndex
    orientationRef.current = orientation
    callbacksRef.current.onPageChange(pageIndex + 1, orientation)

    if (pdf) {
      const visiblePages = orientation === 'landscape'
        ? [pageIndex, pageIndex + 1, pageIndex + 2, pageIndex + 3]
        : [pageIndex, pageIndex + 1, pageIndex - 1]
      preparePages(pdf, visiblePages.map((index) => index + 1))
        .then(() => pruneCache(pageIndex + 1))
        .catch((renderError) => callbacksRef.current.onLoadError(renderError))
    }
  }, [pdf, preparePages, pruneCache])

  const handleFlip = useCallback((event) => {
    const flip = bookRef.current?.pageFlip()
    if (!flip) return
    updatePage(event.data, flip.getOrientation())
  }, [updatePage])

  const handleOrientation = useCallback((event) => {
    updatePage(pageIndexRef.current, event.data)
  }, [updatePage])

  const handleStateChange = useCallback((event) => {
    const isBusy = event.data !== 'read'
    busyRef.current = isBusy
    callbacksRef.current.onBusyChange(isBusy)

    if (!isBusy && pdf) {
      const pageIndex = bookRef.current?.pageFlip().getCurrentPageIndex() ?? pageIndexRef.current
      const orientation = bookRef.current?.pageFlip().getOrientation() ?? orientationRef.current
      updatePage(pageIndex, orientation)
    }
  }, [pdf, updatePage])

  const navigate = useCallback(async (direction) => {
    const flip = bookRef.current?.pageFlip()
    if (!flip || !pdf || busyRef.current) return

    const currentPage = flip.getCurrentPageIndex()
    const orientation = flip.getOrientation()
    const destinationPage = orientation === 'landscape'
      ? direction > 0
        ? currentPage === 0 ? 1 : currentPage + 2
        : currentPage <= 1 ? 0 : currentPage - 2
      : currentPage + direction

    if (destinationPage < 0 || destinationPage >= pageCount) return

    busyRef.current = true
    callbacksRef.current.onBusyChange(true)
    try {
      const pagesToPrepare = orientation === 'landscape'
        ? [destinationPage, destinationPage + 1, destinationPage + 2]
        : [destinationPage, destinationPage + 1]
      await preparePages(pdf, pagesToPrepare.map((index) => index + 1))
      if (direction > 0) flip.flipNext()
      else flip.flipPrev()
    } catch (renderError) {
      busyRef.current = false
      callbacksRef.current.onBusyChange(false)
      callbacksRef.current.onLoadError(renderError)
    }
  }, [pageCount, pdf, preparePages])

  const goToPage = useCallback(async (pageNumber) => {
    const flip = bookRef.current?.pageFlip()
    if (!flip || !pdf || busyRef.current) return

    const targetPage = Math.max(0, Math.min(pageCount - 1, pageNumber - 1))
    busyRef.current = true
    callbacksRef.current.onBusyChange(true)
    try {
      const targetSpread = orientationRef.current === 'landscape'
        ? targetPage === 0 ? [0] : [targetPage - ((targetPage - 1) % 2), targetPage + 1]
        : [targetPage]
      await preparePages(pdf, targetSpread.map((index) => index + 1))
      flip.turnToPage(targetPage)
      const current = flip.getCurrentPageIndex()
      updatePage(current, flip.getOrientation())
    } catch (renderError) {
      callbacksRef.current.onLoadError(renderError)
    } finally {
      busyRef.current = false
      callbacksRef.current.onBusyChange(false)
    }
  }, [pageCount, pdf, preparePages, updatePage])

  useImperativeHandle(forwardedRef, () => ({
    next: () => navigate(1),
    previous: () => navigate(-1),
    goToPage,
  }), [goToPage, navigate])

  useEffect(() => () => {
    bookRef.current?.pageFlip()?.destroy()
  }, [])

  return (
    <div className="pdf-document">
      {isReady ? (
        <div className="flipbook-host">
          <HTMLFlipBook
            ref={bookRef}
            className="flipbook"
            style={{ width: '100%', height: pageHeight }}
            width={pageWidth}
            height={pageHeight}
            size="stretch"
            minWidth={180}
            maxWidth={520}
            minHeight={280}
            maxHeight={900}
            drawShadow
            flippingTime={900}
            usePortrait
            autoSize={false}
            maxShadowOpacity={0.72}
            showCover
            mobileScrollSupport
            useMouseEvents
            showPageCorners={false}
            onInit={(event) => updatePage(event.data.page ?? 0, event.data.mode)}
            onFlip={handleFlip}
            onChangeOrientation={handleOrientation}
            onChangeState={handleStateChange}
          >
            {pages}
          </HTMLFlipBook>
        </div>
      ) : (
        <div className="page-loading" role="status">
          <span className="spinner" />
          {loadError || 'Preparando las primeras páginas...'}
        </div>
      )}
    </div>
  )
})

export default PdfBook
