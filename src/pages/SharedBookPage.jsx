import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useLocation, useParams } from 'react-router-dom'
import BookReader from '../components/BookReader.jsx'
import ReaderAuthPanel from '../components/ReaderAuthPanel.jsx'
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
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(Boolean(supabase))
  const [savingBook, setSavingBook] = useState(false)
  const [bookAccess, setBookAccess] = useState(null)
  const [signedResult, setSignedResult] = useState(null)
  const [error, setError] = useState('')
  const [metadataResult, setMetadataResult] = useState(null)
  const [metadataError, setMetadataError] = useState(null)
  const linkTitle = new URLSearchParams(location.search).get('title')?.trim() || 'Libro compartido'
  const isLegacyId = bookIdPattern.test(bookSlug ?? '')
  const isValidSlug = bookSlugPattern.test(bookSlug ?? '') && (bookSlug?.length ?? 0) <= 160
  const isValidLink = isLegacyId || isValidSlug

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null)
        setCheckingSession(false)
      }
    })

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(`No se pudo comprobar la sesión: ${sessionError.message}`)
      setUser(data.session?.user ?? null)
      setCheckingSession(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    if (!supabase || !user || !isValidLink) return undefined

    const metadataRequest = isLegacyId
      ? supabase.rpc('get_shared_book', { requested_id: bookSlug })
      : supabase.rpc('get_shared_book_by_slug', { requested_slug: bookSlug })

    metadataRequest
      .then(({ data, error: requestError }) => {
        if (!active) return
        if (requestError) {
          setMetadataError({
            bookSlug,
            userId: user.id,
            message: `No se pudieron cargar los detalles del libro: ${requestError.message}`,
          })
          return
        }
        if (data?.[0]) {
          setMetadataResult({ bookSlug, userId: user.id, data: data[0] })
          setMetadataError(null)
          setError('')
        } else if (!isLegacyId) {
          setMetadataError({
            bookSlug,
            userId: user.id,
            message: 'No encontramos un libro con este título. Comprueba el enlace.',
          })
        }
      })
      .catch((requestError) => {
        if (active) {
          setMetadataError({
            bookSlug,
            userId: user.id,
            message: `No se pudieron cargar los detalles del libro: ${requestError.message}`,
          })
        }
      })

    return () => {
      active = false
    }
  }, [bookSlug, isLegacyId, isValidLink, user])

  const metadata = metadataResult?.bookSlug === bookSlug && metadataResult?.userId === user?.id
    ? metadataResult.data
    : null
  const currentBookAccess = bookAccess?.bookId === metadata?.id && bookAccess?.userId === user?.id
    ? bookAccess
    : null
  const canRead = Boolean(currentBookAccess?.canRead)
  const isSaved = Boolean(currentBookAccess?.isSaved)
  const checkingBookAccess = Boolean(metadata && !currentBookAccess)
  const signedUrls = signedResult?.bookId === metadata?.id && signedResult?.userId === user?.id
    ? signedResult
    : null

  useEffect(() => {
    if (!supabase || !user || !metadata) return undefined

    let active = true
    Promise.all([
      supabase
        .from('user_books')
        .select('book_id')
        .eq('book_id', metadata.id)
        .maybeSingle(),
      supabase
        .from('books')
        .select('id')
        .eq('id', metadata.id)
        .maybeSingle(),
    ]).then(([savedResult, accessResult]) => {
      if (!active) return
      if (savedResult.error) throw savedResult.error
      if (accessResult.error) throw accessResult.error
      setBookAccess({
        bookId: metadata.id,
        userId: user.id,
        isSaved: Boolean(savedResult.data),
        canRead: Boolean(accessResult.data),
      })
      setError('')
    }).catch((accessError) => {
      if (active) {
        setBookAccess({
          bookId: metadata.id,
          userId: user.id,
          isSaved: false,
          canRead: false,
        })
        setError(`No se pudo comprobar el acceso al libro: ${accessError.message}`)
      }
    })

    return () => {
      active = false
    }
  }, [metadata, user])

  useEffect(() => {
    if (!supabase || !user || !metadata) return undefined

    let active = true
    const filePath = metadata.file_path || `${metadata.id}.pdf`
    Promise.all([
      canRead
        ? supabase.storage.from(BOOKS_BUCKET).createSignedUrl(filePath, 86400)
        : Promise.resolve({ data: { signedUrl: '' }, error: null }),
      canRead && metadata.cover_path
        ? supabase.storage.from(BOOKS_BUCKET).createSignedUrl(metadata.cover_path, 86400)
        : Promise.resolve({ data: { signedUrl: '' }, error: null }),
    ]).then(([fileResult, coverResult]) => {
      if (!active) return
      if (fileResult.error) throw fileResult.error
      if (coverResult.error) throw coverResult.error
      setSignedResult({
        bookId: metadata.id,
        userId: user.id,
        file: fileResult.data.signedUrl,
        cover: coverResult.data.signedUrl,
      })
      setError('')
    }).catch((urlError) => {
      if (active) setError(`No se pudo preparar el acceso privado al libro: ${urlError.message}`)
    })

    return () => {
      active = false
    }
  }, [canRead, metadata, user])

  async function saveBook() {
    if (!supabase || !metadata || savingBook) return
    setSavingBook(true)
    setError('')
    try {
      const { error: saveError } = await supabase.rpc('save_shared_book', {
        requested_book: bookSlug,
      })
      if (saveError) throw saveError
      setBookAccess({
        bookId: metadata.id,
        userId: user.id,
        isSaved: true,
        canRead: true,
      })
    } catch (saveError) {
      setError(`No se pudo guardar el libro en tu biblioteca: ${saveError.message}`)
    } finally {
      setSavingBook(false)
    }
  }

  const bookMetadata = metadata ?? {
    title: isLegacyId ? linkTitle : 'Libro compartido',
    subtitle: '',
    description: '',
    author: '',
    original_filename: '',
  }
  const currentMetadataError = metadataError?.bookSlug === bookSlug && metadataError?.userId === user?.id
    ? metadataError.message
    : ''
  const file = signedUrls?.file || null
  const coverImage = signedUrls?.cover || ''

  useEffect(() => {
    document.title = file ? bookMetadata.title : 'Mi biblioteca'
    return () => {
      document.title = 'Mi biblioteca'
    }
  }, [bookMetadata.title, file])

  const isLoadingMetadata = Boolean(user) && isValidLink
    && !isLegacyId
    && !metadata
    && !currentMetadataError

  return (
    <div className="app-shell reader-theme">
      <main className="shared-reader-main">
        {user && <a className="reader-library-backlink" href="/library">← Mi biblioteca</a>}
        {!supabase ? (
          <section className="empty-state">
            <h1>Lector no configurado</h1>
            <p>Este libro no se puede abrir porque el proyecto todavía no está conectado a Supabase.</p>
          </section>
        ) : checkingSession ? (
          <div className="page-loading session-loading"><span className="spinner" /> Comprobando sesión...</div>
        ) : !user ? (
          <ReaderAuthPanel returnTo={`${location.pathname}${location.search}`} />
        ) : metadata && (!hasOpenedBook || !canRead) ? (
          <section className="book-intro" aria-labelledby="book-intro-title">
                <div className="book-intro-copy">
                  <span className="book-intro-eyebrow">UN REGALO PARA TI</span>
                  <h1 id="book-intro-title">{bookMetadata.subtitle || 'Hecho con cariño, para ti'}</h1>
                  <p>Preparamos este rinconcito para que disfrutes tu libro página por página.</p>
                  {bookMetadata.author && <span className="book-intro-author">Con cariño, {bookMetadata.author}</span>}
                </div>
                {!canRead && !checkingBookAccess && (
                  <div className="reader-save-book">
                    <p>Guarda este libro en tu biblioteca para poder abrirlo y volver a encontrarlo después.</p>
                    <button
                      className="book-intro-open"
                      type="button"
                      onClick={saveBook}
                      disabled={savingBook}
                    >
                      {savingBook ? 'Guardando…' : 'Guardar y abrir mi libro'}
                    </button>
                  </div>
                )}
                {checkingBookAccess && (
                  <p className="reader-save-status">Comprobando si este libro ya está en tu biblioteca…</p>
                )}
                {error && <p className="error-message" role="alert">{error}</p>}
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
                {bookMetadata.description && (
                  <p className="book-intro-description">{bookMetadata.description}</p>
                )}
                {canRead && (
                  <>
                    <button
                      className="book-intro-open"
                      type="button"
                      onClick={() => setIsOpeningBook(true)}
                      disabled={isOpeningBook || !file}
                    >
                      <BookOpen size={18} />
                      {isOpeningBook ? 'Abriendo tu libro…' : file ? 'Abrir mi libro' : 'Preparando tu libro…'}
                    </button>
                    <span className="book-intro-hint">
                      {isSaved ? 'Guardado en tu biblioteca · Toca para comenzar a leer' : 'Toca el botón para comenzar a leer'}
                    </span>
                  </>
                )}
              </section>
        ) : file ? (
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
        ) : isLoadingMetadata || checkingBookAccess || (metadata && canRead && !file && !error) ? (
          <div className="page-loading session-loading"><span className="spinner" /> Buscando el libro...</div>
        ) : error ? (
          <section className="empty-state">
            <h1>No pudimos abrir este libro</h1>
            <p>{error}</p>
            <a href="/library">Ir a mi biblioteca</a>
          </section>
        ) : (
          <section className="empty-state">
            <h1>Enlace no válido</h1>
            <p>
              {currentMetadataError || 'Revisa que el enlace esté completo y vuelve a intentarlo.'}
            </p>
          </section>
        )}
      </main>
    </div>
  )
}

export default SharedBookPage
