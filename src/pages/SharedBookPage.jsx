import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import BookReader from '../components/BookReader.jsx'
import { BOOKS_BUCKET, supabase } from '../lib/supabase.js'

const bookIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function SharedBookPage() {
  const { bookId } = useParams()
  const location = useLocation()
  const [error, setError] = useState('')
  const linkTitle = new URLSearchParams(location.search).get('title')?.trim() || 'Libro compartido'
  const [metadataResult, setMetadataResult] = useState(null)
  const [metadataError, setMetadataError] = useState(null)

  useEffect(() => {
    let active = true

    if (supabase && bookIdPattern.test(bookId ?? '')) {
      supabase.rpc('get_shared_book', { requested_id: bookId })
        .then(({ data, error: requestError }) => {
          if (!active) return
          if (requestError) {
            setMetadataError({
              bookId,
              message: `No se pudieron cargar los detalles del libro: ${requestError.message}`,
            })
            return
          }
          if (data?.[0]) setMetadataResult({ bookId, data: data[0] })
        })
        .catch((requestError) => {
          if (active) {
            setMetadataError({
              bookId,
              message: `No se pudieron cargar los detalles del libro: ${requestError.message}`,
            })
          }
        })
    }

    return () => {
      active = false
    }
  }, [bookId, linkTitle])

  const bookMetadata = metadataResult?.bookId === bookId
    ? metadataResult.data
    : { title: linkTitle, subtitle: '', description: '', author: '' }
  const currentMetadataError = metadataError?.bookId === bookId ? metadataError.message : ''

  useEffect(() => {
    document.title = `${bookMetadata.title} · Folio`
    return () => {
      document.title = 'Folio — Tu espacio de lectura'
    }
  }, [bookMetadata.title])

  const validLink = bookIdPattern.test(bookId ?? '')
  const file = validLink && supabase
    ? supabase.storage.from(BOOKS_BUCKET).getPublicUrl(`${bookId}.pdf`).data.publicUrl
    : null

  return (
    <div className="app-shell">
      <main className="shared-reader-main">
        {file ? (
          <BookReader
            file={file}
            fileName={`${bookMetadata.title}.pdf`}
            bookTitle={bookMetadata.title}
            bookSubtitle={bookMetadata.subtitle}
            bookDescription={bookMetadata.description}
            bookAuthor={bookMetadata.author}
            onLoadError={() => setError('No pudimos abrir este libro. El enlace puede haber caducado o el PDF ya no estar disponible.')}
          />
        ) : (
          <section className="empty-state">
            <h1>{supabase ? 'Enlace no válido' : 'Lector no configurado'}</h1>
            <p>
              {supabase
                ? 'Revisa que el enlace esté completo y vuelve a intentarlo.'
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
