import { useEffect, useRef, useState } from 'react'
import { Check, Copy, FileText, Upload } from 'lucide-react'
import BookReader from '../components/BookReader.jsx'
import SiteHeader from '../components/SiteHeader.jsx'
import {
  BOOKS_BUCKET,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase.js'

function AdminPage() {
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [file, setFile] = useState(null)
  const [shareUrl, setShareUrl] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const uploadRef = useRef(null)

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
    setShareUrl('')
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
    if (!supabase || !file || saving) return

    setError('')
    setSaving(true)
    const bookId = crypto.randomUUID()
    const { error: uploadError } = await supabase.storage
      .from(BOOKS_BUCKET)
      .upload(`${bookId}.pdf`, file, {
        cacheControl: '3600',
        contentType: 'application/pdf',
        upsert: false,
      })

    setSaving(false)
    if (uploadError) {
      setError(`No se pudo guardar el PDF: ${uploadError.message}`)
      return
    }

    setShareUrl(`${window.location.origin}/book/${bookId}`)
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

  return (
    <div className="app-shell">
      <SiteHeader note="Administración" onSignOut={user ? signOut : undefined} />
      <main className="main-content">
        <section className="intro">
          <p className="eyebrow"><span /> ADMINISTRACIÓN</p>
          <h1>{user ? 'Subir y revisar el PDF' : 'Panel privado'}</h1>
          <p className="intro-copy">
            {user
              ? 'Carga el libro aquí y comparte el enlace de lectura con quien quieras.'
              : 'Inicia sesión para administrar tus libros.'}
          </p>
        </section>

        {!isSupabaseConfigured ? (
          <div className="admin-notice" role="alert">
            Faltan las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.
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
            <p className="admin-notice" role="note">
              Los enlaces de lectura permiten ver el libro a quien los tenga. No los compartas si el documento es confidencial.
            </p>
            {file ? (
              <>
                <BookReader
                  file={file}
                  fileName={file.name}
                  fileSize={file.size}
                  shareUrl={shareUrl}
                  saving={saving}
                  onSave={saveAndCreateLink}
                  onClose={() => {
                    setFile(null)
                    setShareUrl('')
                    setError('')
                  }}
                  error={error}
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
                <button
                  className="secondary-button replace-button"
                  onClick={() => {
                    setFile(null)
                    setShareUrl('')
                    setError('')
                  }}
                >
                  Elegir otro PDF
                </button>
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
                <p className="upload-description">Elige un documento para revisarlo y crear su enlace.</p>
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
        <footer className="page-footer"><span>Lector privado · Enlace de lectura compartible</span></footer>
      </main>
    </div>
  )
}

export default AdminPage
