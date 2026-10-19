import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, FileText, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import BookReader from '../components/BookReader.jsx'
import SiteHeader from '../components/SiteHeader.jsx'
import {
  BOOKS_BUCKET,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase.js'

const bookIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emptyMetadata = { title: '', subtitle: '', description: '', author: '' }
const bookFields = 'id,title,subtitle,description,author,file_path,created_at,updated_at'

function createShareUrl(book) {
  const params = new URLSearchParams({ title: book.title })
  return `${window.location.origin}/book/${book.id}?${params.toString()}`
}

function AdminPage() {
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [file, setFile] = useState(null)
  const [bookTitle, setBookTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [author, setAuthor] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [books, setBooks] = useState([])
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [editingBook, setEditingBook] = useState(null)
  const [activeView, setActiveView] = useState('dashboard')
  const [deletingBookId, setDeletingBookId] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedBookId, setCopiedBookId] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const uploadRef = useRef(null)

  useEffect(() => {
    if (!editingBook) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !saving) setEditingBook(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingBook, saving])

  const fetchBooks = useCallback(async () => {
    if (!supabase) return []

    const [metadataResult, storageFiles] = await Promise.all([
      supabase.from('books').select(bookFields).order('created_at', { ascending: false }),
      (async () => {
        const files = []
        let offset = 0
        let batch
        do {
          const { data, error: listError } = await supabase.storage
            .from(BOOKS_BUCKET)
            .list('', { limit: 100, offset, sortBy: { column: 'created_at', order: 'desc' } })
          if (listError) throw listError
          batch = data ?? []
          files.push(...batch)
          offset += batch.length
        } while (batch.length === 100)
        return files
      })(),
    ])

    if (metadataResult.error) throw metadataResult.error

    const metadataById = new Map((metadataResult.data ?? []).map((book) => [book.id, book]))
    return storageFiles
      .filter((entry) => entry.name.endsWith('.pdf'))
      .map((entry) => {
        const id = entry.name.slice(0, -4)
        if (!bookIdPattern.test(id)) return null
        const metadata = metadataById.get(id)
        return {
          ...emptyMetadata,
          ...metadata,
          id,
          file_path: `${id}.pdf`,
          title: metadata?.title || 'Libro compartido',
          created_at: metadata?.created_at || entry.created_at,
          hasMetadata: Boolean(metadata),
        }
      })
      .filter(Boolean)
      .sort((first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0))
  }, [])

  const loadBooks = useCallback(async () => {
    setLoadingBooks(true)
    setError('')
    try {
      setBooks(await fetchBooks())
    } catch (loadError) {
      setError(`No se pudieron cargar tus libros: ${loadError.message}`)
    } finally {
      setLoadingBooks(false)
    }
  }, [fetchBooks])

  useEffect(() => {
    if (!supabase) return undefined

    let isMounted = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUser(session?.user ?? null)
        setCheckingSession(false)
      }
    })

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isMounted) return
      if (sessionError) setError(`No se pudo comprobar la sesión: ${sessionError.message}`)
      setUser(data.session?.user ?? null)
      setCheckingSession(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) return undefined

    let active = true
    fetchBooks()
      .then((loadedBooks) => {
        if (active) setBooks(loadedBooks)
        if (active) setError('')
      })
      .catch((loadError) => {
        if (active) setError(`No se pudieron cargar tus libros: ${loadError.message}`)
      })
      .finally(() => {
        if (active) setLoadingBooks(false)
      })

    return () => {
      active = false
    }
  }, [fetchBooks, user])

  async function signIn(event) {
    event.preventDefault()
    if (!supabase) return

    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(`No se pudo iniciar sesión: ${signInError.message}`)
  }

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(`No se pudo cerrar sesión: ${signOutError.message}`)
    else {
      setFile(null)
      setShareUrl('')
      setEditingBook(null)
      setBooks([])
      setError('')
    }
  }

  function selectFile(nextFile) {
    if (!nextFile) return
    if (nextFile.size > 50 * 1024 * 1024) {
      setError('Este PDF supera el límite de 50 MB. Elige un archivo más pequeño.')
      return
    }
    if (nextFile.type !== 'application/pdf' && !nextFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Ese archivo no parece ser un PDF. Elige un archivo .pdf para continuar.')
      return
    }

    setFile(nextFile)
    setBookTitle((currentTitle) => currentTitle.trim() || nextFile.name.replace(/\.pdf$/i, '').trim())
    setShareUrl('')
    setEditingBook(null)
    setError('')
  }

  function handleFileChange(event) {
    selectFile(event.target.files?.[0])
    event.target.value = ''
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    selectFile(event.dataTransfer.files?.[0])
  }

  async function saveAndCreateLink() {
    if (!supabase || !user || !file || !bookTitle.trim() || saving || shareUrl) return

    setError('')
    setSaving(true)
    const bookId = crypto.randomUUID()
    const filePath = `${bookId}.pdf`
    try {
      const { error: uploadError } = await supabase.storage
        .from(BOOKS_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { error: metadataError } = await supabase.from('books').insert({
        id: bookId,
        owner_id: user.id,
        file_path: filePath,
        title: bookTitle.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        author: author.trim(),
        updated_at: new Date().toISOString(),
      })

      if (metadataError) {
        const { error: cleanupError } = await supabase.storage.from(BOOKS_BUCKET).remove([filePath])
        if (cleanupError) {
          throw new Error(`${metadataError.message}. Además, no se pudo retirar el PDF incompleto: ${cleanupError.message}`)
        }
        throw metadataError
      }

      const savedBook = {
        id: bookId,
        title: bookTitle.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        author: author.trim(),
      }
      setShareUrl(createShareUrl(savedBook))
      await loadBooks()
    } catch (uploadError) {
      setError(`No se pudo guardar el libro: ${uploadError.message}`)
    } finally {
      setSaving(false)
    }
  }

  function startEditing(book) {
    setEditingBook(book)
    setBookTitle(book.title)
    setSubtitle(book.subtitle)
    setDescription(book.description)
    setAuthor(book.author)
    setError('')
    setFile(null)
    setShareUrl('')
    setActiveView('dashboard')
  }

  function startNewBook() {
    setFile(null)
    setBookTitle('')
    setSubtitle('')
    setDescription('')
    setAuthor('')
    setShareUrl('')
    setEditingBook(null)
    setError('')
    setActiveView('create')
  }

  function returnToDashboard() {
    setFile(null)
    setBookTitle('')
    setSubtitle('')
    setDescription('')
    setAuthor('')
    setShareUrl('')
    setEditingBook(null)
    setError('')
    setActiveView('dashboard')
  }

  async function updateBook(event) {
    event.preventDefault()
    if (!supabase || !user || !editingBook || !bookTitle.trim() || saving) return

    setError('')
    setSaving(true)
    try {
      const { error: updateError } = await supabase.from('books').upsert({
        id: editingBook.id,
        owner_id: user.id,
        file_path: editingBook.file_path,
        title: bookTitle.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        author: author.trim(),
        updated_at: new Date().toISOString(),
      })
      if (updateError) throw updateError

      await loadBooks()
      setEditingBook(null)
      setBookTitle('')
      setSubtitle('')
      setDescription('')
      setAuthor('')
    } catch (updateError) {
      setError(`No se pudieron guardar los cambios: ${updateError.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function deleteBook(book) {
    if (!supabase || !user || deletingBookId) return
    if (!window.confirm(`¿Eliminar “${book.title}” y su PDF? El enlace dejará de funcionar.`)) return

    setError('')
    setDeletingBookId(book.id)
    try {
      const { error: storageError } = await supabase.storage.from(BOOKS_BUCKET).remove([book.file_path])
      if (storageError) throw storageError

      const { error: metadataError } = await supabase.from('books').delete().eq('id', book.id)
      if (metadataError) {
        throw new Error(`El PDF se eliminó, pero no se pudo borrar su ficha: ${metadataError.message}`)
      }

      setBooks((currentBooks) => currentBooks.filter((entry) => entry.id !== book.id))
      if (editingBook?.id === book.id) setEditingBook(null)
    } catch (deleteError) {
      setError(`No se pudo completar la eliminación: ${deleteError.message}`)
      await loadBooks()
    } finally {
      setDeletingBookId('')
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (clipboardError) {
      setError(`No se pudo copiar el enlace: ${clipboardError.message}`)
    }
  }

  async function copyBookLink(book) {
    try {
      await navigator.clipboard.writeText(createShareUrl(book))
      setCopiedBookId(book.id)
      window.setTimeout(() => setCopiedBookId(''), 1800)
    } catch (clipboardError) {
      setError(`No se pudo copiar el enlace: ${clipboardError.message}`)
    }
  }

  function renderMetadataFields(disabled = false) {
    return (
      <div className="metadata-form-grid">
        <label className="book-title-input">
          <span>Título *</span>
          <input
            type="text"
            value={bookTitle}
            onChange={(event) => setBookTitle(event.target.value.slice(0, 120))}
            maxLength={120}
            placeholder="Nombre del libro"
            required
            disabled={disabled}
          />
        </label>
        <label className="book-title-input">
          <span>Subtítulo</span>
          <input
            type="text"
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value.slice(0, 160))}
            maxLength={160}
            placeholder="Opcional"
            disabled={disabled}
          />
        </label>
        <label className="book-title-input">
          <span>Autor</span>
          <input
            type="text"
            value={author}
            onChange={(event) => setAuthor(event.target.value.slice(0, 120))}
            maxLength={120}
            placeholder="Opcional"
            disabled={disabled}
          />
        </label>
        <label className="book-title-input metadata-description">
          <span>Descripción</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 2000))}
            maxLength={2000}
            rows={3}
            placeholder="Una breve descripción del libro"
            disabled={disabled}
          />
        </label>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <SiteHeader note="Administración" onSignOut={user ? signOut : undefined} />
      <main className="main-content">
        {(!user || activeView === 'create') && (
          <section className="intro">
            <p className="eyebrow"><span /> ADMINISTRACIÓN</p>
            <h1>{user ? 'Nuevo libro digital' : 'Panel privado'}</h1>
            <p className="intro-copy">
              {user
                ? 'Sube el PDF y agrega los detalles que aparecerán en la página de lectura.'
                : 'Inicia sesión para administrar tus libros.'}
            </p>
          </section>
        )}

        {!isSupabaseConfigured ? (
          <div className="admin-notice" role="alert">
            Faltan las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
            Configúralas en el archivo local <code>.env.local</code> y en Vercel.
          </div>
        ) : checkingSession ? (
          <div className="page-loading session-loading"><span className="spinner" /> Comprobando acceso...</div>
        ) : !user ? (
          <section className="login-card">
            <div className="upload-illustration"><FileText size={27} strokeWidth={1.7} /></div>
            <h2>Acceso solo para ti</h2>
            <p className="upload-description">Usa la cuenta de administrador creada en Supabase.</p>
            <form className="login-form" onSubmit={signIn}>
              <label htmlFor="admin-email">Correo electrónico</label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <label htmlFor="admin-password">Contraseña de la cuenta</label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button className="primary-button" type="submit">Iniciar sesión</button>
            </form>
            {error && <p className="error-message" role="alert">{error}</p>}
          </section>
        ) : (
          <>
            {activeView === 'dashboard' ? (
              <>
                <div className="dashboard-heading">
                  <div>
                    <p className="eyebrow">BIBLIOTECA</p>
                    <h2>Todos tus libros</h2>
                    <p>Administra tus publicaciones y comparte sus enlaces.</p>
                  </div>
                  <button className="primary-button" onClick={startNewBook}>
                    <Plus size={17} />
                    Nuevo libro digital
                  </button>
                </div>
                {error && <p className="error-message catalog-error" role="alert">{error}</p>}
                {error.includes('libros') && (
                  <p className="catalog-help">
                    Comprueba que hayas ejecutado el SQL actualizado de <code>supabase/setup.sql</code> en Supabase.
                  </p>
                )}
                {loadingBooks && books.length === 0 ? (
                  <section className="book-catalog catalog-empty"><p className="catalog-message">Cargando tus libros…</p></section>
                ) : books.length === 0 ? (
                  <section className="book-catalog catalog-empty">
                    <div className="upload-illustration"><FileText size={27} strokeWidth={1.7} /></div>
                    <h2>Aún no tienes libros</h2>
                    <p className="upload-description">Agrega tu primer libro digital para crear un enlace de lectura.</p>
                    <button className="primary-button" onClick={startNewBook}>
                      <Plus size={17} />
                      Agregar nuevo libro digital
                    </button>
                  </section>
                ) : (
                  <section className="book-catalog" aria-labelledby="catalog-title">
                    <div className="catalog-heading">
                      <h2 id="catalog-title">Libros en tu biblioteca</h2>
                      <span className="catalog-count">{books.length}</span>
                    </div>
                    <ul className="book-list">
                      {books.map((book) => (
                        <li className="book-list-item" key={book.id}>
                          <div className="book-list-info">
                            <span className="book-list-icon"><FileText size={17} /></span>
                            <div className="book-list-copy">
                              <strong>{book.title}</strong>
                              <span>
                                {[book.author, book.subtitle].filter(Boolean).join(' · ') || 'PDF'}
                                {!book.hasMetadata && ' · Completa los detalles'}
                              </span>
                            </div>
                          </div>
                          <div className="book-list-actions">
                            <a
                              className="secondary-button catalog-open-link"
                              href={createShareUrl(book)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Abrir ${book.title}`}
                            >
                              Abrir
                            </a>
                            <button
                              className="icon-button catalog-action"
                              onClick={() => copyBookLink(book)}
                              aria-label={`Copiar enlace de ${book.title}`}
                              title="Copiar enlace"
                            >
                              {copiedBookId === book.id ? <Check size={17} /> : <Copy size={17} />}
                            </button>
                            <button
                              className="icon-button catalog-action"
                              onClick={() => startEditing(book)}
                              aria-label={`Editar ${book.title}`}
                              title="Editar detalles"
                            >
                              <Pencil size={17} />
                            </button>
                            <button
                              className="icon-button catalog-action catalog-delete"
                              onClick={() => deleteBook(book)}
                              disabled={deletingBookId === book.id}
                              aria-label={`Eliminar ${book.title}`}
                              title="Eliminar libro"
                            >
                              {deletingBookId === book.id ? <span className="spinner" /> : <Trash2 size={17} />}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <p className="admin-notice dashboard-notice" role="note">
                  Los enlaces permiten leer el libro a quien los tenga. No compartas enlaces a documentos confidenciales.
                </p>
              </>
            ) : (
              <>
                <button className="back-to-library" onClick={returnToDashboard}>
                  <ArrowLeft size={16} />
                  Volver a mis libros
                </button>
                <p className="admin-notice" role="note">
                  Los enlaces de lectura permiten ver el libro a quien los tenga. No los compartas si el documento es confidencial.
                </p>
                <section className="metadata-editor upload-metadata">
                  <div className="catalog-heading">
                    <div>
                      <p className="eyebrow">DETALLES DEL LIBRO</p>
                      <h2>{shareUrl ? 'Libro guardado' : 'Información del libro'}</h2>
                    </div>
                  </div>
                  {renderMetadataFields(Boolean(shareUrl))}
                </section>
                {file ? (
                  <>
                    <BookReader
                      file={file}
                      fileName={file.name}
                      bookTitle={bookTitle}
                      fileSize={file.size}
                      shareUrl={shareUrl}
                      saving={saving}
                      canSave={Boolean(bookTitle.trim()) && !shareUrl}
                      onSave={saveAndCreateLink}
                      onClose={() => {
                        setFile(null)
                        setShareUrl('')
                        setError('')
                      }}
                      onLoadError={() => setError('No pudimos abrir este PDF. Comprueba que no esté dañado o protegido.')}
                    />
                    {shareUrl && (
                      <section className="share-card" aria-label="Enlace compartible">
                        <div>
                          <h2>Tu libro ya está en línea</h2>
                          <p>Cualquier persona con este enlace puede abrirlo.</p>
                        </div>
                        <div className="share-link-row">
                          <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
                          <button className="icon-button" onClick={copyShareLink} aria-label="Copiar enlace">
                            {copied ? <Check size={18} /> : <Copy size={18} />}
                          </button>
                        </div>
                      </section>
                    )}
                    {error && <p className="error-message upload-error" role="alert">{error}</p>}
                  </>
                ) : (
                  <section
                    className={`upload-card${isDragging ? ' is-dragging' : ''}`}
                    onDragEnter={(event) => {
                      event.preventDefault()
                      setIsDragging(true)
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false)
                    }}
                    onDrop={handleDrop}
                  >
                    <div className="upload-illustration">
                      <div className="upload-paper"><FileText size={27} strokeWidth={1.7} /></div>
                      <span className="upload-spark spark-one" />
                      <span className="upload-spark spark-two" />
                    </div>
                    <h2>Selecciona el PDF del libro</h2>
                    <p className="upload-description">Elige un documento para agregarlo a tu biblioteca.</p>
                    <button className="primary-button" onClick={() => uploadRef.current?.click()}>
                      <Upload size={17} />
                      Seleccionar PDF
                    </button>
                    <input
                      ref={uploadRef}
                      className="visually-hidden"
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={handleFileChange}
                      aria-label="Elegir un archivo PDF"
                    />
                    <p className="file-hint"><Check size={14} /> PDF de hasta 50 MB.</p>
                    {error && <p className="error-message" role="alert">{error}</p>}
                  </section>
                )}
              </>
            )}
            {editingBook && activeView === 'dashboard' && (
              <div
                className="modal-backdrop"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget && !saving) setEditingBook(null)
                }}
              >
                <form
                  className="metadata-editor edit-book-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="edit-book-title"
                  onSubmit={updateBook}
                >
                  <div className="catalog-heading">
                    <div>
                      <p className="eyebrow">DETALLES DEL LIBRO</p>
                      <h2 id="edit-book-title">Editar libro</h2>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setEditingBook(null)}
                      disabled={saving}
                      aria-label="Cerrar edición"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  {renderMetadataFields()}
                  <div className="metadata-form-actions">
                    <button className="primary-button" type="submit" disabled={saving || !bookTitle.trim()}>
                      {saving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setEditingBook(null)}
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                  </div>
                  {error && <p className="error-message upload-error" role="alert">{error}</p>}
                </form>
              </div>
            )}
          </>
        )}
        <footer className="page-footer"><span>Lector privado · Enlace de lectura compartible</span></footer>
      </main>
    </div>
  )
}

export default AdminPage
