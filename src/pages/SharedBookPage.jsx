import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import BookReader from '../components/BookReader.jsx'
import SiteHeader from '../components/SiteHeader.jsx'
import { BOOKS_BUCKET, supabase } from '../lib/supabase.js'

const bookIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function SharedBookPage() {
  const { bookId } = useParams()
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Libro compartido · Folio'
    return () => {
      document.title = 'Folio — Tu espacio de lectura'
    }
  }, [])

  const validLink = bookIdPattern.test(bookId ?? '')
  const file = validLink && supabase
    ? supabase.storage.from(BOOKS_BUCKET).getPublicUrl(`${bookId}.pdf`).data.publicUrl
    : null

  return (
    <div className="app-shell">
      <SiteHeader note="Libro compartido" />
      <main className="main-content shared-content">
        {file ? (
          <>
            <section className="intro">
              <p className="eyebrow"><span /> LIBRO COMPARTIDO</p>
              <h1>Disfruta la lectura</h1>
            </section>
            <BookReader
              file={file}
              fileName="Libro compartido"
              error={error}
              onLoadError={() => setError('No pudimos abrir este libro. El enlace puede haber caducado o el PDF ya no estar disponible.')}
            />
            {error && <p className="error-message upload-error" role="alert">{error}</p>}
          </>
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
