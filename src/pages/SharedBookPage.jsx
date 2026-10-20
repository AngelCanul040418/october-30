import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useLocation, useParams } from 'react-router-dom'
import BookReader from '../components/BookReader.jsx'
import { BOOKS_BUCKET, supabase } from '../lib/supabase.js'

const bookIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const bookSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isReloadingBookLink() {
  const navigation = window.performance.getEntriesByType('navigation')[0]
  if (navigation?.type !== 'reload') return false

  return new URL(navigation.name, window.location.href).pathname === window.location.pathname
}

function SharedBookPage() {
  const { bookSlug } = useParams()
  const location = useLocation()
  const [hasOpenedBook, setHasOpenedBook] = useState(isReloadingBookLink)
  const [isOpeningBook, setIsOpeningBook] = useState(false)
  const [error, setError] = useState('')
  const [metadataResult, setMetadataResult] = useState(null)
  const [metadataError, setMetadataError] = useState(null)
  const linkTitle = new URLSearchParams(location.search).get('title')?.trim() || 'Libro compartido'
  const isLegacyId = bookIdPattern.test(bookSlug ?? '')
  const isValidSlug = bookSlugPattern.test(bookSlug ?? '') && (bookSlug?.length ?? 0) <= 160
  const isValidLink = isLegacyId || isValidSlug

  useEffect(() => {
    let active = true

    if (!supabase || !isValidLink) return undefined

    const metadataRequest = isLegacyId
      ? supabase.rpc('get_shared_book', { requested_id: bookSlug })
      : supabase.rpc('get_shared_book_by_slug', { requested_slug: bookSlug })

    metadataRequest
      .then(({ data, error: requestError }) => {
        if (!active) return
        if (requestError) {
          setMetadataError({
            bookSlug,
            message: `No se pudieron cargar los detalles del libro: ${requestError.message}`,
          })
          return
        }
        if (data?.[0]) {
          setMetadataResult({ bookSlug, data: data[0] })
          setMetadataError(null)
        } else if (!isLegacyId) {
          setMetadataError({
            bookSlug,
            message: 'No encontramos un libro con este título. Comprueba el enlace.',
          })
        }
      })
      .catch((requestError) => {
        if (active) {
          setMetadataError({
            bookSlug,
            message: `No se pudieron cargar los detalles del libro: ${requestError.message}`,
          })
        }
      })

    return () => {
      active = false
    }
  }, [bookSlug, isLegacyId, isValidLink])

  const metadata = metadataResult?.bookSlug === bookSlug
    ? metadataResult.data
    : null
  const bookMetadata = metadata ?? {
    title: isLegacyId ? linkTitle : 'Libro compartido',
    subtitle: '',
    description: '',
    author: '',
    original_filename: '',
  }
  const currentMetadataError = metadataError?.bookSlug === bookSlug
    ? metadataError.message
    : ''
  const filePath = isLegacyId ? `${bookSlug}.pdf` : metadata?.file_path
  const file = isValidLink && filePath && supabase
    ? supabase.storage.from(BOOKS_BUCKET).getPublicUrl(filePath).data.publicUrl
    : null
  const coverImage = metadata?.cover_path && supabase
    ? supabase.storage.from(BOOKS_BUCKET).getPublicUrl(metadata.cover_path).data.publicUrl
    : ''

  useEffect(() => {
    document.title = file ? bookMetadata.title : 'Mi biblioteca'
    return () => {
      document.title = 'Mi biblioteca'
    }
  }, [bookMetadata.title, file])

  const isLoadingMetadata = isValidLink
    && !isLegacyId
    && !metadata
    && !currentMetadataError

  return (
    <div className="app-shell reader-theme">
      <main className="shared-reader-main">
        {file ? (
          <>
            {!hasOpenedBook ? (
              <section className="book-intro" aria-labelledby="book-intro-title">
                <div className="book-intro-copy">
                  <span className="book-intro-eyebrow">UN REGALO PARA TI</span>
                  <h1 id="book-intro-title">{bookMetadata.subtitle || 'Hecho con cariño, para ti'}</h1>
                  <p>Preparamos este rinconcito para que disfrutes tu libro página por página.</p>
                  {bookMetadata.author && <span className="book-intro-author">Con cariño, {bookMetadata.author}</span>}
                </div>
                <div className={`book-intro-cover-wrap${isOpeningBook ? ' book-intro-opening' : ''}`}>
                  <div
                    className="book-intro-bow"
                    aria-hidden="true"
                    onAnimationEnd={(event) => {
                      if (event.animationName === 'book-intro-unwrap') setHasOpenedBook(true)
                    }}
                  >
                    <svg viewBox="0 0 100 64" role="presentation">
                      <path d="M49 32C34 7 9 6 8 22c-1 13 19 20 41 10M51 32C66 7 91 6 92 22c1 13-19 20-41 10" />
                      <path d="M46 37 34 58l14-6 3-14M54 37l12 21-14-6-3-14" />
                      <circle cx="50" cy="32" r="9" />
                    </svg>
                  </div>
                  {coverImage ? (
                    <img className="book-intro-cover" src={coverImage} alt={`Portada de ${bookMetadata.title}`} />
                  ) : (
                    <div className="book-intro-cover book-intro-cover-fallback">
                      <BookOpen size={44} strokeWidth={1.2} />
                      <span>{bookMetadata.title}</span>
                    </div>
                  )}
                </div>
                <button
                  className="book-intro-open"
                  type="button"
                  onClick={() => setIsOpeningBook(true)}
                  disabled={isOpeningBook}
                >
                  <BookOpen size={18} />
                  {isOpeningBook ? 'Abriendo tu libro…' : 'Abrir mi libro'}
                </button>
                <span className="book-intro-hint">Toca el botón para comenzar a leer</span>
              </section>
            ) : (
              <>
                <div className="reader-welcome" aria-hidden="true">
                  <img className="reader-welcome-kitty" src="/sticker-1.png" alt="" />
                  <div>
                    <span>UN RINCONCITO PARA LEER</span>
                    <p>Hecho con cariño, página por página</p>
                  </div>
                  <img className="reader-welcome-bow" src="/sticker-2.png" alt="" />
                </div>
                <BookReader
                  file={file}
                  fileName={bookMetadata.original_filename || `${bookMetadata.title}.pdf`}
                  bookTitle={bookMetadata.title}
                  bookSubtitle={bookMetadata.subtitle}
                  bookDescription={bookMetadata.description}
                  bookAuthor={bookMetadata.author}
                  coverImage={coverImage}
                  onLoadError={() => setError('No pudimos abrir este libro. El enlace puede haber caducado o el PDF ya no estar disponible.')}
                />
              </>
            )}
          </>
        ) : isLoadingMetadata ? (
          <div className="page-loading session-loading"><span className="spinner" /> Buscando el libro...</div>
        ) : (
          <section className="empty-state">
            <h1>{supabase ? 'Enlace no válido' : 'Lector no configurado'}</h1>
            <p>
              {supabase
                ? currentMetadataError || 'Revisa que el enlace esté completo y vuelve a intentarlo.'
                : 'Este libro no se puede abrir porque el proyecto todavía no está conectado a Supabase.'}
            </p>
          </section>
        )}
        {error && file && <p className="metadata-load-error" role="alert">{error}</p>}
        {currentMetadataError && file && <p className="metadata-load-error" role="status">{currentMetadataError}</p>}
      </main>
    </div>
  )
}

export default SharedBookPage
