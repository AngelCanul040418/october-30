import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import BookReader from '../components/BookReader.jsx'
import { BOOKS_BUCKET, supabase } from '../lib/supabase.js'

const bookIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const bookSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function SharedBookPage() {
  const { bookSlug } = useParams()
  const location = useLocation()
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
