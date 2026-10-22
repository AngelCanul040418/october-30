import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Library, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import ReaderAuthPanel from '../components/ReaderAuthPanel.jsx'
import SiteHeader from '../components/SiteHeader.jsx'
import { BOOKS_BUCKET, isSupabaseConfigured, supabase } from '../lib/supabase.js'

const libraryFields = 'added_at,book:books(id,title,subtitle,author,slug,cover_path)'

async function showReaderAlert(options) {
  const [{ default: Swal }] = await Promise.all([
    import('sweetalert2'),
    import('sweetalert2/dist/sweetalert2.min.css'),
  ])
  return Swal.fire(options)
}

function ReaderLibraryPage() {
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured)
  const [books, setBooks] = useState([])
  const [booksUserId, setBooksUserId] = useState('')
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [removingBookId, setRemovingBookId] = useState('')
  const [error, setError] = useState('')

  const loadBooks = useCallback(async (isActive = () => true) => {
    if (!supabase || !user) return

    setLoadingBooks(true)
    setError('')
    try {
      const { data, error: queryError } = await supabase
        .from('user_books')
        .select(libraryFields)
        .order('added_at', { ascending: false })
      if (queryError) throw queryError

      const withCovers = await Promise.all((data ?? []).map(async (entry) => {
        if (!entry.book?.cover_path) return entry
        const { data: signedCover, error: coverError } = await supabase.storage
          .from(BOOKS_BUCKET)
          .createSignedUrl(entry.book.cover_path, 86400)
        if (coverError) throw coverError
        return { ...entry, book: { ...entry.book, cover_url: signedCover.signedUrl } }
      }))
      if (!isActive()) return
      setBooks(withCovers.filter((entry) => entry.book))
      setBooksUserId(user.id)
    } catch (loadError) {
      if (isActive()) {
        setBooks([])
        setBooksUserId(user.id)
        setError(`No se pudo cargar tu biblioteca: ${loadError.message}`)
      }
    } finally {
      if (isActive()) setLoadingBooks(false)
    }
  }, [user])

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null)
        if (!session?.user) {
          setBooks([])
          setBooksUserId('')
          setLoadingBooks(false)
        }
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
    if (!user) return undefined

    let active = true
    Promise.resolve().then(() => {
      if (active) loadBooks(() => active)
    })
    return () => {
      active = false
    }
  }, [loadBooks, user])

  async function removeBook(book) {
    if (!supabase || removingBookId) return
    setRemovingBookId(book.id)
    setError('')

    let confirmation
    try {
      confirmation = await showReaderAlert({
        icon: 'warning',
        title: '¿Quitar este libro?',
        text: `“${book.title}” dejará de aparecer en tu biblioteca.`,
        showCancelButton: true,
        confirmButtonText: 'Sí, quitar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#a83e61',
      })
    } catch (alertError) {
      setError(`No se pudo mostrar la confirmación: ${alertError.message}`)
      setRemovingBookId('')
      return
    }

    if (!confirmation.isConfirmed) {
      setRemovingBookId('')
      return
    }

    try {
      const { error: deleteError } = await supabase
        .from('user_books')
        .delete()
        .eq('book_id', book.id)
      if (deleteError) throw deleteError
      setBooks((currentBooks) => currentBooks.filter((entry) => entry.book.id !== book.id))
    } catch (deleteError) {
      setError(`No se pudo quitar el libro de tu biblioteca: ${deleteError.message}`)
      setRemovingBookId('')
      return
    }

    setRemovingBookId('')
    try {
      await showReaderAlert({
        icon: 'success',
        title: 'Libro quitado',
        text: `“${book.title}” se quitó de tu biblioteca.`,
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#294d3d',
      })
    } catch (alertError) {
      setError(`El libro se quitó, pero no se pudo mostrar la confirmación: ${alertError.message}`)
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(`No se pudo cerrar sesión: ${signOutError.message}`)
  }

  const visibleBooks = booksUserId === user?.id ? books : []
  const booksLoadedForUser = booksUserId === user?.id

  if (!isSupabaseConfigured) {
    return (
      <div className="app-shell reader-theme">
        <main className="shared-reader-main">
          <section className="empty-state">
            <h1>Biblioteca no configurada</h1>
            <p>Este proyecto todavía no está conectado a Supabase.</p>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell reader-theme">
      <SiteHeader note="Mi biblioteca" homeHref="/library" onSignOut={user ? signOut : undefined} />
      <main className="shared-reader-main reader-library-main">
        {checkingSession ? (
          <div className="page-loading session-loading"><span className="spinner" /> Comprobando sesión...</div>
        ) : !user ? (
          <ReaderAuthPanel returnTo="/library" />
        ) : (
          <>
            <div className="reader-library-heading">
              <div className="reader-auth-icon"><Library size={22} /></div>
              <p className="book-intro-eyebrow">TUS LIBROS GUARDADOS</p>
              <h1>Mi biblioteca</h1>
              <p>Todos los libros que te han compartido, reunidos en un solo lugar.</p>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            {loadingBooks || !booksLoadedForUser ? (
              <div className="page-loading"><span className="spinner" /> Cargando tus libros...</div>
            ) : visibleBooks.length ? (
              <ul className="reader-library-grid">
                {visibleBooks.map(({ book }) => (
                  <li className="reader-library-card" key={book.id}>
                    <Link className="reader-library-cover" to={`/book/${encodeURIComponent(book.slug || book.id)}`}>
                      {book.cover_url ? (
                        <img src={book.cover_url} alt={`Portada de ${book.title}`} />
                      ) : (
                        <span className="reader-library-cover-fallback"><BookOpen size={36} /></span>
                      )}
                    </Link>
                    <div className="reader-library-card-copy">
                      <Link to={`/book/${encodeURIComponent(book.slug || book.id)}`}>
                        <h2>{book.title}</h2>
                      </Link>
                      <p>{[book.author, book.subtitle].filter(Boolean).join(' · ') || 'Libro compartido'}</p>
                      <div className="reader-library-card-actions">
                        <Link className="book-intro-open" to={`/book/${encodeURIComponent(book.slug || book.id)}`}>
                          Abrir libro
                        </Link>
                        <button
                          className="reader-library-remove"
                          type="button"
                          onClick={() => removeBook(book)}
                          disabled={removingBookId === book.id}
                          aria-label={`Quitar ${book.title} de mi biblioteca`}
                          title="Quitar de mi biblioteca"
                        >
                          {removingBookId === book.id ? <span className="spinner" /> : <Trash2 size={17} />}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <section className="empty-state reader-library-empty">
                <div className="reader-auth-icon"><BookOpen size={23} /></div>
                <h2>Aún no tienes libros guardados</h2>
                <p>Abre un enlace que te hayan compartido y guárdalo para encontrarlo aquí.</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default ReaderLibraryPage
