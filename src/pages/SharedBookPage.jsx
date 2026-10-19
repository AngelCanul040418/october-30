import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import BookReader from '../components/BookReader.jsx'
import { BOOKS_BUCKET, supabase } from '../lib/supabase.js'

const bookIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function SharedBookPage() {
  const { bookId } = useParams()
  const location = useLocation()
  const [error, setError] = useState('')
  const bookTitle = new URLSearchParams(location.search).get('title')?.trim() || 'Libro compartido'

  useEffect(() => {
    document.title = `${bookTitle} · Folio`
    return () => {
      document.title = 'Folio — Tu espacio de lectura'
    }
  }, [bookTitle])

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
            fileName={`${bookTitle}.pdf`}
            bookTitle={bookTitle}
            error={error}
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
      </main>
    </div>
  )
}

export default SharedBookPage
