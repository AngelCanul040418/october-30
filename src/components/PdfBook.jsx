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

    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.src = url
    try {
      await image.decode()
    } catch (decodeError) {
      URL.revokeObjectURL(url)
      throw decodeError
    }

    return {
      url,
      width: viewport.width / pixelRatio,
      height: viewport.height / pixelRatio,
    }
  })
}

const FlipPage = forwardRef(function FlipPage(
  {
    pageIndex,
    pageNumber,
    nodesRef,
    assetsRef,
  },
  forwardedRef,
) {
  const setRef = useCallback((node) => {
    if (node) {
      nodesRef.current[pageIndex] = node
      for (const image of node.querySelectorAll('img[data-pdf-page]')) {
        const asset = assetsRef.current.get(Number(image.dataset.pdfPage))
        if (asset) image.src = asset.url
      }
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
      data-page-number={pageNumber}
      data-density="soft"
    >
      <img alt="" data-pdf-page={pageNumber} draggable="false" />
    </div>
  )
})

function getLandscapeSpreadStart(pageIndex) {
  if (pageIndex <= 0) return 0
  return pageIndex % 2 === 0 ? pageIndex - 1 : pageIndex
}

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
  const [closedPosition, setClosedPosition] = useState('')
  const [isTurning, setIsTurning] = useState(false)
  const [isEdgeTurning, setIsEdgeTurning] = useState(false)
  const cacheRef = useRef(new Map())
  const pageAssetsRef = useRef(new Map())
  const pageNodesRef = useRef([])
  const pdfRef = useRef(null)
  const bookRef = useRef(null)
  const flipInstanceRef = useRef(null)
  const bookReadyRef = useRef(false)
  const destroyTimerRef = useRef(null)
  const pageIndexRef = useRef(0)
  const orientationRef = useRef('portrait')
  const busyRef = useRef(false)
  const callbacksRef = useRef({ onLoadSuccess, onLoadError, onPageChange, onBusyChange })

  useEffect(() => {
    callbacksRef.current = { onLoadSuccess, onLoadError, onPageChange, onBusyChange }
  }, [onBusyChange, onLoadError, onLoadSuccess, onPageChange])

  const applyPageAsset = useCallback((pageNumber, asset) => {
    pageAssetsRef.current.set(pageNumber, asset)
    for (const node of pageNodesRef.current) {
      const images = node?.querySelectorAll(`img[data-pdf-page="${pageNumber}"]`) ?? []
      for (const image of images) {
        if (image.src !== asset.url) image.src = asset.url
      }
    }
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

    if (pdfRef.current !== document) {
      for (const { asset } of assets) {
        URL.revokeObjectURL(asset.url)
      }
      return
    }

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
          for (const node of pageNodesRef.current) {
            const images = node?.querySelectorAll(`img[data-pdf-page="${cachedPage}"]`) ?? []
            for (const image of images) {
              if (image.src === asset.url) image.removeAttribute('src')
            }
          }
        }
        URL.revokeObjectURL(asset.url)
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    let active = true
    let loadingTask
    const assetCache = cacheRef.current
    const pageAssets = pageAssetsRef.current

    async function loadPdf() {
      try {
        const source = file instanceof Blob
          ? { data: new Uint8Array(await file.arrayBuffer()) }
          : { url: file }

        loadingTask = getDocument(source)
        const loadedDocument = await loadingTask.promise
        const firstPage = await loadedDocument.getPage(1)
        const firstViewport = firstPage.getViewport({ scale: 1 })
        firstPage.cleanup()

        if (!active) {
          await loadingTask.destroy()
          return
        }

        const count = loadedDocument.numPages
        pdfRef.current = loadedDocument
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

    setPdf(null)
    setPageCount(0)
    setIsReady(false)
    setLoadError('')
    setClosedPosition('')
    setIsTurning(false)
    setIsEdgeTurning(false)
    busyRef.current = false
    bookReadyRef.current = false
    pageIndexRef.current = 0
    orientationRef.current = 'portrait'
    pdfRef.current = null
    loadPdf()

    return () => {
      active = false
      pdfRef.current = null
      if (loadingTask) loadingTask.destroy().catch(() => {})
      for (const assetPromise of assetCache.values()) {
        assetPromise.then((asset) => URL.revokeObjectURL(asset.url)).catch(() => {})
      }
      assetCache.clear()
      pageAssets.clear()
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

    return Array.from({ length: pageCount }, (_, index) => (
      <FlipPage
        key={index + 1}
        pageIndex={index}
        pageNumber={index + 1}
        nodesRef={pageNodesRef}
        assetsRef={pageAssetsRef}
      />
    ))
  }, [isReady, pageCount])

  const updatePage = useCallback((pageIndex, orientation = orientationRef.current) => {
    pageIndexRef.current = pageIndex
    orientationRef.current = orientation
    callbacksRef.current.onPageChange(Math.max(1, pageIndex + 1), orientation)

    if (pdf) {
      const firstVisiblePage = pageIndex + 1
      const visiblePages = orientation === 'landscape'
        ? [firstVisiblePage, firstVisiblePage + 1, firstVisiblePage + 2, firstVisiblePage + 3]
        : [firstVisiblePage, firstVisiblePage + 1, firstVisiblePage - 1]
      preparePages(pdf, visiblePages)
        .then(() => pruneCache(firstVisiblePage))
        .catch((renderError) => callbacksRef.current.onLoadError(renderError))
    }
  }, [pdf, preparePages, pruneCache])

  const alignBook = useCallback((pageIndex, orientation) => {
    if (orientation !== 'landscape') {
      setClosedPosition('')
      return
    }
    if (pageIndex === 0) {
      setClosedPosition('flipbook-closed-start')
    } else if (pageIndex === pageCount - 1) {
      setClosedPosition('flipbook-closed-end')
    } else {
      setClosedPosition('')
    }
  }, [pageCount])

  const handleFlip = useCallback((event) => {
    const flip = bookReadyRef.current ? flipInstanceRef.current : null
    if (!flip) return
    const orientation = flip.getOrientation()
    updatePage(event.data, orientation)
    alignBook(event.data, orientation)
  }, [alignBook, updatePage])

  const handleInit = useCallback((event) => {
    if (!isReady) return
    const flip = bookRef.current?.pageFlip()
    if (!flip || flip.getPageCount() !== pageCount) return

    flipInstanceRef.current = flip
    bookReadyRef.current = true
    const currentIndex = Math.max(0, Math.min(pageCount - 1, pageIndexRef.current))
    const targetIndex = event.data.mode === 'landscape'
      ? getLandscapeSpreadStart(currentIndex)
      : currentIndex
    if (flip.getCurrentPageIndex() !== targetIndex) {
      flip.turnToPage(targetIndex)
    }
    const pageIndex = flip.getCurrentPageIndex()
    updatePage(pageIndex, event.data.mode)
    alignBook(pageIndex, event.data.mode)
  }, [alignBook, isReady, pageCount, updatePage])

  const handleUpdate = useCallback((event) => {
    if (!bookReadyRef.current) return
    const pageIndex = event.data.page ?? 0
    updatePage(pageIndex, event.data.mode)
    alignBook(pageIndex, event.data.mode)
  }, [alignBook, updatePage])

  const handleOrientation = useCallback((event) => {
    const flip = bookReadyRef.current ? flipInstanceRef.current : null
    if (!flip) return

    const currentPageIndex = pageIndexRef.current
    const targetPageIndex = event.data === 'landscape'
      ? getLandscapeSpreadStart(currentPageIndex)
      : currentPageIndex
    if (targetPageIndex < 0 || targetPageIndex >= pageCount) return

    flip.turnToPage(targetPageIndex)
    updatePage(flip.getCurrentPageIndex(), event.data)
    alignBook(flip.getCurrentPageIndex(), event.data)
  }, [alignBook, pageCount, updatePage])

  const handleStateChange = useCallback((event) => {
    const isBusy = event.data !== 'read'
    busyRef.current = isBusy
    setIsTurning(isBusy)
    callbacksRef.current.onBusyChange(isBusy)
    const flip = bookReadyRef.current ? flipInstanceRef.current : null
    if (!flip) return

    const currentPage = flip.getCurrentPageIndex()
    const isEdgeTurn = currentPage <= 2 || currentPage >= pageCount - 3
    setIsEdgeTurning(isBusy && isEdgeTurn)

    if (!isBusy && pdf) {
      const pageIndex = flip.getCurrentPageIndex()
      const orientation = flip.getOrientation()
      updatePage(pageIndex, orientation)
      alignBook(pageIndex, orientation)
    }
  }, [alignBook, pageCount, pdf, updatePage])

  const navigate = useCallback(async (direction) => {
    const flip = bookReadyRef.current ? flipInstanceRef.current : null
    if (!flip || !pdf || busyRef.current) return

    const currentPageIndex = flip.getCurrentPageIndex()
    const orientation = flip.getOrientation()
    const destinationPageIndex = orientation === 'landscape'
      ? direction > 0
        ? currentPageIndex === 0 ? 1 : currentPageIndex + 2
        : currentPageIndex <= 1 ? 0 : currentPageIndex - 2
      : currentPageIndex + direction

    if (destinationPageIndex < 0 || destinationPageIndex >= pageCount) return

    busyRef.current = true
    callbacksRef.current.onBusyChange(true)
    try {
      const pagesToPrepare = orientation === 'landscape'
        ? [destinationPageIndex + 1, destinationPageIndex + 2, destinationPageIndex + 3]
        : [destinationPageIndex + 1, destinationPageIndex + 2]
      await preparePages(pdf, pagesToPrepare)
      if (!bookReadyRef.current || flipInstanceRef.current !== flip) {
        busyRef.current = false
        callbacksRef.current.onBusyChange(false)
        return
      }
      if (direction > 0) flip.flipNext()
      else flip.flipPrev()
    } catch (renderError) {
      busyRef.current = false
      callbacksRef.current.onBusyChange(false)
      callbacksRef.current.onLoadError(renderError)
    }
  }, [pageCount, pdf, preparePages])

  const goToPage = useCallback(async (pageNumber) => {
    const flip = bookReadyRef.current ? flipInstanceRef.current : null
    if (!flip || !pdf || busyRef.current) return

    const targetPage = Math.max(1, Math.min(pageCount, pageNumber))
    const targetPageIndex = targetPage - 1
    const targetSpreadStart = orientationRef.current === 'landscape'
      ? getLandscapeSpreadStart(targetPageIndex)
      : targetPageIndex
    busyRef.current = true
    callbacksRef.current.onBusyChange(true)
    try {
      const targetSpread = orientationRef.current === 'landscape'
        ? [targetSpreadStart + 1, targetSpreadStart + 2]
        : [targetPage]
      await preparePages(pdf, targetSpread)
      if (!bookReadyRef.current || flipInstanceRef.current !== flip) return
      flip.turnToPage(targetSpreadStart)
      const current = flip.getCurrentPageIndex()
      const orientation = flip.getOrientation()
      updatePage(current, orientation)
      alignBook(current, orientation)
    } catch (renderError) {
      callbacksRef.current.onLoadError(renderError)
    } finally {
      busyRef.current = false
      callbacksRef.current.onBusyChange(false)
    }
  }, [alignBook, pageCount, pdf, preparePages, updatePage])

  useImperativeHandle(forwardedRef, () => ({
    next: () => navigate(1),
    previous: () => navigate(-1),
    goToPage,
  }), [goToPage, navigate])

  useEffect(() => {
    if (!isReady) {
      bookReadyRef.current = false
      busyRef.current = false
      if (flipInstanceRef.current) {
        flipInstanceRef.current.destroy()
        flipInstanceRef.current = null
      }
    }
  }, [isReady])

  useEffect(() => {
    if (destroyTimerRef.current !== null) {
      window.clearTimeout(destroyTimerRef.current)
      destroyTimerRef.current = null
      if (flipInstanceRef.current) bookReadyRef.current = true
    }

    return () => {
      const flip = bookReadyRef.current ? flipInstanceRef.current : null
      if (!flip) return

      bookReadyRef.current = false
      destroyTimerRef.current = window.setTimeout(() => {
        destroyTimerRef.current = null
        if (flipInstanceRef.current !== flip) return
        flip.destroy()
        flipInstanceRef.current = null
      }, 0)
    }
  }, [])

  return (
    <div className="pdf-document">
      {isReady ? (
        <div className="flipbook-host">
          <HTMLFlipBook
            ref={bookRef}
            className={`flipbook ${closedPosition}${isTurning ? ' flipbook-turning' : ''}${isEdgeTurning ? ' flipbook-edge-turning' : ''}`}
            style={{ width: '100%', height: pageHeight, '--flipbook-page-width': `${pageWidth}px` }}
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
            onInit={handleInit}
            onUpdate={handleUpdate}
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
