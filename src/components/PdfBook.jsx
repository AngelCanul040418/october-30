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

const FLIPPING_TIME = 1500

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

function getLandscapeSpreadStart(pageIndex) {
  if (pageIndex === 0) return 0
  return pageIndex % 2 === 0 ? pageIndex - 1 : pageIndex
}

function getClosedPosition(pageIndex, pageCount, orientation) {
  if (orientation !== 'landscape') return ''
  if (pageIndex === 0) return 'flipbook-closed-start'
  if (pageCount % 2 === 0 && pageIndex === pageCount - 1) {
    return 'flipbook-closed-end'
  }
  return ''
}

const FlipPage = forwardRef(function FlipPage(
  { pageIndex, pageNumber, isBackCoverLeaf, nodesRef, assetsRef },
  forwardedRef,
) {
  const setRef = useCallback((node) => {
    if (node) {
      nodesRef.current[pageIndex] = node
      const image = node.querySelector('img[data-pdf-page]')
      const asset = assetsRef.current.get(pageNumber)
      if (asset) image.src = asset.url
      else image.removeAttribute('src')
    } else {
      delete nodesRef.current[pageIndex]
    }

    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }, [assetsRef, forwardedRef, nodesRef, pageIndex, pageNumber])

  return (
    <div
      ref={setRef}
      className={`flipbook-page${isBackCoverLeaf ? ' flipbook-back-cover-leaf' : ''}`}
      data-page-number={pageNumber}
      data-density="soft"
    >
      <img alt="" data-pdf-page={pageNumber} draggable="false" />
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
  const [isTurning, setIsTurning] = useState(false)
  const [closedPosition, setClosedPosition] = useState('')

  const cacheRef = useRef(new Map())
  const pageAssetsRef = useRef(new Map())
  const pageNodesRef = useRef([])
  const bookRef = useRef(null)
  const flipInstanceRef = useRef(null)
  const pageIndexRef = useRef(0)
  const orientationRef = useRef('portrait')
  const busyRef = useRef(false)
  const callbacksRef = useRef({ onLoadSuccess, onLoadError, onPageChange, onBusyChange })

  useEffect(() => {
    callbacksRef.current = { onLoadSuccess, onLoadError, onPageChange, onBusyChange }
  }, [onBusyChange, onLoadError, onLoadSuccess, onPageChange])

  const applyPageAsset = useCallback((pageNumber, asset) => {
    pageAssetsRef.current.set(pageNumber, asset)
    const node = pageNodesRef.current[pageNumber - 1]
    const image = node?.querySelector(`img[data-pdf-page="${pageNumber}"]`)
    if (image && image.src !== asset.url) image.src = asset.url
  }, [])

  const getPageAsset = useCallback((document, pageNumber, width) => {
    const key = `${pageNumber}:${Math.round(width)}`
    const cached = cacheRef.current.get(key)
    if (cached) return cached

    const assetPromise = renderPage(document, pageNumber, width)
    cacheRef.current.set(key, assetPromise)
    assetPromise.catch(() => {
      if (cacheRef.current.get(key) === assetPromise) {
        cacheRef.current.delete(key)
      }
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

        setPdf(loadedDocument)
        setPageCount(loadedDocument.numPages)
        pageAssetsRef.current.clear()
        callbacksRef.current.onLoadSuccess({
          numPages: loadedDocument.numPages,
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
    pageAssetsRef.current.clear()
    setIsReady(false)
    setLoadError('')
    pageIndexRef.current = 0
    orientationRef.current = 'portrait'
    busyRef.current = false
    loadPdf()

    return () => {
      active = false
      if (loadingTask) loadingTask.destroy().catch(() => {})
      pageAssets.clear()
      for (const assetPromise of assetCache.values()) {
        assetPromise.then((asset) => URL.revokeObjectURL(asset.url)).catch(() => {})
      }
      assetCache.clear()
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
  }, [pdf, preparePages])

  const pages = useMemo(() => {
    if (!isReady || pageCount === 0) return []

    return Array.from({ length: pageCount }, (_, index) => {
      const pageNumber = index + 1
      return (
        <FlipPage
          key={pageNumber}
          pageIndex={index}
          pageNumber={pageNumber}
          isBackCoverLeaf={index === pageCount - 3}
          nodesRef={pageNodesRef}
          assetsRef={pageAssetsRef}
        />
      )
    })
  }, [isReady, pageCount])

  const updatePage = useCallback((pageIndex, orientation = orientationRef.current) => {
    pageIndexRef.current = pageIndex
    orientationRef.current = orientation
    callbacksRef.current.onPageChange(pageIndex + 1, orientation)

    if (!pdf) return

    const firstVisiblePage = pageIndex + 1
    const visiblePages = orientation === 'landscape'
      ? [firstVisiblePage, firstVisiblePage + 1, firstVisiblePage + 2, firstVisiblePage + 3]
      : [firstVisiblePage, firstVisiblePage + 1, firstVisiblePage - 1]

    preparePages(pdf, visiblePages)
      .then(() => {
        for (const [key, assetPromise] of cacheRef.current) {
          const [cachedPage] = key.split(':').map(Number)
          if (
            cachedPage === 1
            || cachedPage === document.numPages
            || Math.abs(cachedPage - firstVisiblePage) <= 4
          ) continue

          cacheRef.current.delete(key)
          assetPromise.then((asset) => {
            const storedAsset = pageAssetsRef.current.get(cachedPage)
            if (storedAsset?.url === asset.url) {
              pageAssetsRef.current.delete(cachedPage)
              const node = pageNodesRef.current[cachedPage - 1]
              const image = node?.querySelector(
                `img[data-pdf-page="${cachedPage}"]`,
              )
              if (image?.src === asset.url) image.removeAttribute('src')
            }
            URL.revokeObjectURL(asset.url)
          }).catch(() => {})
        }
      })
      .catch((renderError) => callbacksRef.current.onLoadError(renderError))
  }, [pdf, preparePages])

  const alignBook = useCallback((pageIndex, orientation) => {
    setClosedPosition(getClosedPosition(pageIndex, pageCount, orientation))
  }, [pageCount])

  const handleInit = useCallback((event) => {
    if (!bookRef.current) return
    const flip = bookRef.current.pageFlip()
    if (!flip) return
    flipInstanceRef.current = flip

    const initialIndex = 0
    if (flip.getCurrentPageIndex() !== initialIndex) flip.turnToPage(initialIndex)
    updatePage(initialIndex, event.data.mode)
    alignBook(initialIndex, event.data.mode)
  }, [alignBook, updatePage])

  const handleFlip = useCallback((event) => {
    const flip = flipInstanceRef.current
    if (!flip) return
    const orientation = flip.getOrientation()
    updatePage(event.data, orientation)
    alignBook(event.data, orientation)
  }, [alignBook, updatePage])

  const handleUpdate = useCallback((event) => {
    const flip = flipInstanceRef.current
    if (!flip) return
    const pageIndex = event.data.page ?? 0
    updatePage(pageIndex, event.data.mode)
    alignBook(pageIndex, event.data.mode)
  }, [alignBook, updatePage])

  const handleOrientation = useCallback((event) => {
    const flip = flipInstanceRef.current
    if (!flip) return

    const currentPageIndex = pageIndexRef.current
    const targetPageIndex = event.data === 'landscape'
      ? getLandscapeSpreadStart(currentPageIndex)
      : currentPageIndex

    if (targetPageIndex < 0 || targetPageIndex >= pageCount) return
    flip.turnToPage(targetPageIndex)
    updatePage(targetPageIndex, event.data)
    alignBook(targetPageIndex, event.data)
  }, [alignBook, pageCount, updatePage])

  const handleStateChange = useCallback((event) => {
    const isBusy = event.data !== 'read'
    busyRef.current = isBusy
    setIsTurning(isBusy)
    callbacksRef.current.onBusyChange(isBusy)

    const flip = flipInstanceRef.current
    if (!flip || !pdf) return

    if (!isBusy) {
      const pageIndex = flip.getCurrentPageIndex()
      const orientation = flip.getOrientation()
      updatePage(pageIndex, orientation)
      alignBook(pageIndex, orientation)
    }
  }, [alignBook, pdf, updatePage])

  const isTurningBackCover = isTurning
    && orientationRef.current === 'landscape'
    && pageCount > 2
    && pageIndexRef.current >= pageCount - 3

  const navigate = useCallback(async (direction) => {
    const flip = flipInstanceRef.current
    if (!flip || !pdf || busyRef.current) return

    const currentIndex = flip.getCurrentPageIndex()
    const orientation = flip.getOrientation()
    const step = orientation === 'landscape' ? 2 : 1
    const destination = orientation === 'landscape'
      ? direction > 0
        ? currentIndex === 0 ? 1 : currentIndex + step
        : currentIndex <= 1 ? 0 : currentIndex - step
      : currentIndex + direction
    const destinationIndex = Math.min(
      Math.max(0, destination),
      Math.max(0, pageCount - 1),
    )

    if (destinationIndex === currentIndex) return

    busyRef.current = true
    callbacksRef.current.onBusyChange(true)

    try {
      const pagesToPrepare = []
      for (let index = destinationIndex; index <= destinationIndex + step + 1; index += 1) {
        if (index >= 0 && index < pageCount) pagesToPrepare.push(index + 1)
      }
      await preparePages(pdf, pagesToPrepare)
      if (direction > 0) flip.flipNext()
      else flip.flipPrev()
    } catch (renderError) {
      callbacksRef.current.onLoadError(renderError)
    } finally {
      busyRef.current = false
      callbacksRef.current.onBusyChange(false)
    }
  }, [pageCount, pdf, preparePages])

  const goToPage = useCallback(async (pageNumber) => {
    const flip = flipInstanceRef.current
    if (!flip || !pdf || busyRef.current) return

    const targetPage = Math.max(1, Math.min(pageCount, pageNumber))
    const targetIndex = targetPage - 1
    const targetSpreadStart = orientationRef.current === 'landscape'
      ? getLandscapeSpreadStart(targetIndex)
      : targetIndex
    busyRef.current = true
    callbacksRef.current.onBusyChange(true)

    try {
      const pagesToPrepare = [
        targetSpreadStart + 1,
        targetSpreadStart + 2,
        targetSpreadStart + 3,
      ]
        .filter((value) => value >= 1 && value <= pageCount)
      await preparePages(pdf, pagesToPrepare)
      flip.turnToPage(targetSpreadStart)
      const pageIndex = flip.getCurrentPageIndex()
      const orientation = flip.getOrientation()
      updatePage(pageIndex, orientation)
      alignBook(pageIndex, orientation)
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

  useEffect(() => () => {
    const flip = flipInstanceRef.current
    if (flip) {
      flip.destroy()
      flipInstanceRef.current = null
    }
  }, [])

  return (
    <div className="pdf-document">
      {isReady ? (
        <div className="flipbook-host">
          <HTMLFlipBook
            ref={bookRef}
            className={`flipbook ${closedPosition}${isTurning ? ' flipbook-turning' : ''}${isTurningBackCover ? ' flipbook-turning-back-cover' : ''}`}
            style={{ width: '100%', height: pageHeight, '--flipbook-page-width': `${pageWidth}px` }}
            width={pageWidth}
            height={pageHeight}
            size="stretch"
            minWidth={180}
            maxWidth={520}
            minHeight={280}
            maxHeight={900}
            drawShadow
            flippingTime={FLIPPING_TIME}
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
