import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Pencil,
  Plus,
  QrCode,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Navigate } from 'react-router-dom'
import BookReader from '../components/BookReader.jsx'
import SiteHeader from '../components/SiteHeader.jsx'
import {
  BOOKS_BUCKET,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase.js'

const bookIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emptyMetadata = { title: '', subtitle: '', description: '', author: '' }
const bookFields = 'id,owner_id,title,subtitle,description,author,file_path,slug,original_filename,cover_path,created_at,updated_at'
const MAX_COVER_SIZE = 10 * 1024 * 1024

async function showAdminAlert(options) {
  const [{ default: Swal }] = await Promise.all([
    import('sweetalert2'),
    import('sweetalert2/dist/sweetalert2.min.css'),
  ])
  return Swal.fire(options)
}

function createShareUrl(book) {
  return `${window.location.origin}/book/${encodeURIComponent(book.slug || book.id)}`
}

function slugifyTitle(title) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'libro'
}

function createUniqueSlug(title, books, excludedId = '') {
  const baseSlug = slugifyTitle(title)
  const existingSlugs = new Set(
    books
      .filter((book) => book.id !== excludedId)
      .map((book) => book.slug)
      .filter(Boolean),
  )
  let slug = baseSlug
  let suffix = 2

  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }

  return slug
}

function getCoverExtension(file) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

async function downloadQrPng(svgElement, filename) {
  const svg = svgElement.cloneNode(true)
  const imageSize = 1024
  svg.setAttribute('width', imageSize)
  svg.setAttribute('height', imageSize)
  svg.style.background = 'transparent'

  const svgBlob = new Blob(
    [new XMLSerializer().serializeToString(svg)],
    { type: 'image/svg+xml;charset=utf-8' },
  )
  const svgUrl = URL.createObjectURL(svgBlob)

  try {
    const image = new Image()
    image.src = svgUrl
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = imageSize
    canvas.height = imageSize
    const context = canvas.getContext('2d')
    if (!context) throw new Error('El navegador no permite crear la imagen.')
    context.drawImage(image, 0, 0, imageSize, imageSize)

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('No se pudo generar el archivo PNG.'))
      }, 'image/png')
    })
    const pngUrl = URL.createObjectURL(pngBlob)
    const anchor = document.createElement('a')
    anchor.href = pngUrl
    anchor.download = filename
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000)
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

function AdminPage({ audience = 'super_admin' }) {
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(isSupabaseConfigured)
  const [roleCheck, setRoleCheck] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const [file, setFile] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [coverRemoved, setCoverRemoved] = useState(false)
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
  const [qrBook, setQrBook] = useState(null)
  const [downloadingQr, setDownloadingQr] = useState(false)
  const [qrDownloadError, setQrDownloadError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const uploadRef = useRef(null)
  const coverUploadRef = useRef(null)
  const qrCodeRef = useRef(null)
  const currentRoleCheck = roleCheck?.userId === user?.id ? roleCheck : null
  const checkingRole = Boolean(user && !currentRoleCheck)
  const isSuperAdmin = currentRoleCheck?.role === 'super_admin'
  const isAuthor = currentRoleCheck?.role === 'author'
  const canManageBooks = isSuperAdmin || isAuthor

  function openQr(book) {
    setQrDownloadError('')
    setQrBook(book)
  }

  useEffect(() => () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview)
  }, [coverPreview])

  useEffect(() => {
    if (!editingBook && !qrBook) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !saving) {
        setEditingBook(null)
        setQrBook(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingBook, qrBook, saving])

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
    const books = storageFiles
      .filter((entry) => entry.name.endsWith('.pdf'))
      .map((entry) => {
        const id = entry.name.slice(0, -4)
        if (!bookIdPattern.test(id)) return null
        const metadata = metadataById.get(id)
        if (!isSuperAdmin && (!metadata || metadata.owner_id !== user?.id)) return null
        return {
          ...emptyMetadata,
          ...metadata,
          id,
          file_path: `${id}.pdf`,
          title: metadata?.title || 'Libro compartido',
          original_filename: metadata?.original_filename || `${metadata?.title || 'Libro compartido'}.pdf`,
          created_at: metadata?.created_at || entry.created_at,
          hasMetadata: Boolean(metadata),
        }
      })
      .filter(Boolean)
      .sort((first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0))
    return Promise.all(books.map(async (book) => {
      if (!book.cover_path) return book
      const { data: signedCover, error: coverError } = await supabase.storage
        .from(BOOKS_BUCKET)
        .createSignedUrl(book.cover_path, 86400)
      if (coverError) throw coverError
      return { ...book, cover_url: signedCover.signedUrl }
    }))
  }, [isSuperAdmin, user])

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
        if (!session?.user) {
          setRoleCheck(null)
        }
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
    if (!supabase || !user) return undefined

    let active = true
    supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error: profileError }) => {
        if (!active) return
        if (profileError) {
          setRoleCheck({ userId: user.id, role: 'reader' })
          setError(`No se pudo comprobar el rol de la cuenta: ${profileError.message}`)
          return
        }
        setRoleCheck({ userId: user.id, role: data?.role || 'reader' })
        if (!['super_admin', 'author'].includes(data?.role)) setActiveView('dashboard')
      })
      .catch((profileError) => {
        if (active) {
          setRoleCheck({ userId: user.id, role: 'reader' })
          setError(`No se pudo comprobar el rol de la cuenta: ${profileError.message}`)
        }
      })

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!user || !canManageBooks) return undefined

    let active = true
    Promise.resolve()
      .then(() => {
        if (!active) return null
        setLoadingBooks(true)
        return fetchBooks()
      })
      .then((loadedBooks) => {
        if (!active || !loadedBooks) return
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
  }, [fetchBooks, canManageBooks, user])

  async function signIn(event) {
    event.preventDefault()
    if (!supabase) return

    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(`No se pudo iniciar sesión: ${signInError.message}`)
  }

  async function sendPasswordReset() {
    if (!supabase || sendingReset) return
    if (!email.trim()) {
      setError('Escribe tu correo electrónico para recuperar la contraseña.')
      return
    }

    setSendingReset(true)
    setError('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (resetError) setError(`No se pudo enviar el enlace de recuperación: ${resetError.message}`)
    else setError('Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo y spam.')
    setSendingReset(false)
  }

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(`No se pudo cerrar sesión: ${signOutError.message}`)
    else {
      setRoleCheck(null)
      setFile(null)
      setCoverFile(null)
      setCoverPreview('')
      setCoverRemoved(false)
      setShareUrl('')
      setEditingBook(null)
      setQrBook(null)
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

  function selectCover(nextFile) {
    if (!nextFile) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type)) {
      setError('La portada debe ser una imagen JPG, PNG o WebP.')
      return
    }
    if (nextFile.size > MAX_COVER_SIZE) {
      setError('La portada supera el límite de 10 MB. Elige una imagen más pequeña.')
      return
    }

    setCoverFile(nextFile)
    setCoverPreview(URL.createObjectURL(nextFile))
    setCoverRemoved(false)
    setError('')
  }

  function handleCoverChange(event) {
    selectCover(event.target.files?.[0])
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
    const bookSlug = createUniqueSlug(bookTitle, books)
    const uploadedPaths = []
    let savedBook = null
    try {
      const { error: uploadError } = await supabase.storage
        .from(BOOKS_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) throw uploadError
      uploadedPaths.push(filePath)

      let coverPath = null
      if (coverFile) {
        coverPath = `${bookId}-cover.${getCoverExtension(coverFile)}`
        const { error: coverUploadError } = await supabase.storage
          .from(BOOKS_BUCKET)
          .upload(coverPath, coverFile, {
            cacheControl: '3600',
            contentType: coverFile.type,
            upsert: false,
          })

        if (coverUploadError) throw coverUploadError
        uploadedPaths.push(coverPath)
      }

      const { error: metadataError } = await supabase.from('books').insert({
        id: bookId,
        owner_id: user.id,
        file_path: filePath,
        slug: bookSlug,
        original_filename: file.name,
        cover_path: coverPath,
        title: bookTitle.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        author: author.trim(),
        updated_at: new Date().toISOString(),
      })

      if (metadataError) throw metadataError

      savedBook = {
        id: bookId,
        slug: bookSlug,
        title: bookTitle.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        author: author.trim(),
      }
      await loadBooks()
      setFile(null)
      setCoverFile(null)
      setCoverPreview('')
      setCoverRemoved(false)
      setBookTitle('')
      setSubtitle('')
      setDescription('')
      setAuthor('')
      setShareUrl('')
      setActiveView('dashboard')
    } catch (uploadError) {
      let message = uploadError.message
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from(BOOKS_BUCKET).remove(uploadedPaths)
        if (cleanupError) {
          message = `${message}. Además, no se pudieron retirar los archivos incompletos: ${cleanupError.message}`
        }
      }
      setError(`No se pudo guardar el libro: ${message}`)
    } finally {
      setSaving(false)
    }

    if (savedBook) {
      try {
        await showAdminAlert({
          icon: 'success',
          title: 'Libro guardado',
          text: `“${savedBook.title}” se guardó correctamente y ya puedes compartir su enlace.`,
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#294d3d',
        })
      } catch (alertError) {
        setError(`El libro se guardó, pero no se pudo mostrar la confirmación: ${alertError.message}`)
      }
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
    setCoverFile(null)
    setCoverPreview('')
    setCoverRemoved(false)
    setShareUrl('')
    setActiveView('dashboard')
  }

  function startNewBook() {
    setFile(null)
    setCoverFile(null)
    setCoverPreview('')
    setCoverRemoved(false)
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
    setCoverFile(null)
    setCoverPreview('')
    setCoverRemoved(false)
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
    let uploadedCoverPath = ''
    let coverMetadataSaved = false
    let cleanupWarning = ''
    let updateSucceeded = false
    try {
      let coverPath = coverRemoved ? null : editingBook.cover_path
      if (coverFile) {
        uploadedCoverPath = `${editingBook.id}-cover-${crypto.randomUUID()}.${getCoverExtension(coverFile)}`
        const { error: coverUploadError } = await supabase.storage
          .from(BOOKS_BUCKET)
          .upload(uploadedCoverPath, coverFile, {
            cacheControl: '3600',
            contentType: coverFile.type,
            upsert: false,
          })
        if (coverUploadError) throw coverUploadError
        coverPath = uploadedCoverPath
      }

      const updatedMetadata = {
        owner_id: editingBook.owner_id || user.id,
        file_path: editingBook.file_path,
        slug: createUniqueSlug(bookTitle, books, editingBook.id),
        original_filename: editingBook.original_filename || `${editingBook.title}.pdf`,
        cover_path: coverPath,
        title: bookTitle.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        author: author.trim(),
        updated_at: new Date().toISOString(),
      }
      const updateQuery = editingBook.hasMetadata
        ? supabase.from('books').update(updatedMetadata).eq('id', editingBook.id)
        : supabase.from('books').insert({ id: editingBook.id, ...updatedMetadata })
      const { error: updateError } = await updateQuery
      if (updateError) throw updateError
      coverMetadataSaved = true

      if (
        editingBook.cover_path
        && editingBook.cover_path !== coverPath
      ) {
        const { error: removeCoverError } = await supabase.storage
          .from(BOOKS_BUCKET)
          .remove([editingBook.cover_path])
        if (removeCoverError) {
          cleanupWarning = `Los cambios se guardaron, pero no se pudo retirar la portada anterior: ${removeCoverError.message}`
        }
      }

      await loadBooks()
      setEditingBook(null)
      setCoverFile(null)
      setCoverPreview('')
      setCoverRemoved(false)
      setBookTitle('')
      setSubtitle('')
      setDescription('')
      setAuthor('')
      updateSucceeded = true
    } catch (updateError) {
      let message = updateError.message
      if (uploadedCoverPath && !coverMetadataSaved) {
        const { error: cleanupError } = await supabase.storage
          .from(BOOKS_BUCKET)
          .remove([uploadedCoverPath])
        if (cleanupError) {
          message = `${message}. No se pudo retirar la portada nueva: ${cleanupError.message}`
        }
      }
      setError(`No se pudieron guardar los cambios: ${message}`)
    } finally {
      setSaving(false)
    }

    if (updateSucceeded) {
      try {
        await showAdminAlert({
          icon: cleanupWarning ? 'warning' : 'success',
          title: cleanupWarning ? 'Cambios guardados con aviso' : 'Libro actualizado',
          text: cleanupWarning
            ? `${cleanupWarning}.`
            : `Los cambios de “${editingBook.title}” se guardaron correctamente.`,
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#294d3d',
        })
      } catch (alertError) {
        setError(`Los cambios se guardaron, pero no se pudo mostrar la confirmación: ${alertError.message}`)
      }
    }
  }

  async function deleteBook(book) {
    if (!supabase || !user || deletingBookId) return
    let confirmation
    try {
      confirmation = await showAdminAlert({
        icon: 'warning',
        title: '¿Eliminar este libro?',
        text: `Se eliminarán “${book.title}” y su PDF. El enlace dejará de funcionar.`,
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#b42318',
        cancelButtonColor: '#6b7280',
        reverseButtons: true,
        focusCancel: true,
      })
    } catch (alertError) {
      setError(`No se pudo mostrar la confirmación de eliminación: ${alertError.message}`)
      return
    }
    if (!confirmation.isConfirmed) return

    setError('')
    setDeletingBookId(book.id)
    let deleted = false
    try {
      const pathsToRemove = [book.file_path, book.cover_path].filter(Boolean)
      const { error: storageError } = await supabase.storage.from(BOOKS_BUCKET).remove(pathsToRemove)
      if (storageError) throw storageError

      const { error: metadataError } = await supabase.from('books').delete().eq('id', book.id)
      if (metadataError) {
        throw new Error(`El PDF se eliminó, pero no se pudo borrar su ficha: ${metadataError.message}`)
      }

      setBooks((currentBooks) => currentBooks.filter((entry) => entry.id !== book.id))
      if (editingBook?.id === book.id) setEditingBook(null)
      deleted = true
    } catch (deleteError) {
      setError(`No se pudo completar la eliminación: ${deleteError.message}`)
      await loadBooks()
    } finally {
      setDeletingBookId('')
    }

    if (deleted) {
      try {
        await showAdminAlert({
          icon: 'success',
          title: 'Libro eliminado',
          text: `“${book.title}” se eliminó correctamente.`,
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#294d3d',
        })
      } catch (alertError) {
        setError(`El libro se eliminó, pero no se pudo mostrar la confirmación: ${alertError.message}`)
      }
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

  async function copyQrLink() {
    if (!qrBook) return
    try {
      await navigator.clipboard.writeText(createShareUrl(qrBook))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (clipboardError) {
      setError(`No se pudo copiar el enlace: ${clipboardError.message}`)
    }
  }

  async function handleDownloadQr() {
    if (!qrBook || !qrCodeRef.current) {
      setQrDownloadError('No se encontró el código QR para descargar.')
      return
    }

    setDownloadingQr(true)
    setQrDownloadError('')
    try {
      await downloadQrPng(qrCodeRef.current, `${slugifyTitle(qrBook.title)}-qr.png`)
    } catch (downloadError) {
      setQrDownloadError(`No se pudo descargar el código QR: ${downloadError.message}`)
    } finally {
      setDownloadingQr(false)
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
        <div className="book-title-input cover-field">
          <span>Portada</span>
          <div className="cover-picker">
            <div className="cover-preview">
              {(coverPreview || (!coverRemoved && editingBook?.cover_url)) ? (
                <img
                  src={coverPreview || editingBook?.cover_url}
                  alt="Vista previa de la portada"
                />
              ) : (
                <BookOpen size={22} />
              )}
            </div>
            <div className="cover-picker-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => coverUploadRef.current?.click()}
                disabled={disabled}
              >
                {editingBook?.cover_path && !coverRemoved ? 'Cambiar imagen' : 'Elegir imagen'}
              </button>
              {(coverFile || (editingBook?.cover_path && !coverRemoved)) && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setCoverFile(null)
                    setCoverPreview('')
                    setCoverRemoved(Boolean(editingBook?.cover_path))
                  }}
                  disabled={disabled}
                >
                  Quitar
                </button>
              )}
              <span>JPG, PNG o WebP · Máximo 10 MB</span>
            </div>
            <input
              ref={coverUploadRef}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleCoverChange}
              aria-label="Elegir imagen de portada"
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <SiteHeader
        note={audience === 'author' ? 'Panel de autor' : 'Administración'}
        homeHref={audience === 'author' ? '/author' : '/'}
        onSignOut={user ? signOut : undefined}
      />
      <main className="main-content">
        {user && audience === 'super_admin' && (
          <a className="admin-dashboard-backlink" href="/">
            <ArrowLeft size={16} />
            Volver al panel del super administrador
          </a>
        )}
        {(!user || activeView === 'create') && (
          <section className="intro">
            <p className="eyebrow"><span /> {audience === 'author' ? 'PANEL DE AUTOR' : 'ADMINISTRACIÓN'}</p>
            <h1>{user ? 'Nuevo libro digital' : 'Acceso privado'}</h1>
            <p className="intro-copy">
              {user
                ? 'Sube el PDF y agrega los detalles que aparecerán en la página de lectura.'
                : 'Inicia sesión con una cuenta autorizada para continuar.'}
            </p>
          </section>
        )}

        {!isSupabaseConfigured ? (
          <div className="admin-notice" role="alert">
            Faltan las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
            Configúralas en el archivo local <code>.env.local</code> y en Vercel.
          </div>
        ) : checkingSession || checkingRole ? (
          <div className="page-loading session-loading"><span className="spinner" /> Comprobando acceso...</div>
        ) : !user ? (
          <section className="login-card">
            <div className="upload-illustration"><FileText size={27} strokeWidth={1.7} /></div>
            <h2>Acceso solo para ti</h2>
            <p className="upload-description">Usa el correo y la contraseña de tu cuenta autorizada.</p>
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
              <div className="password-input-wrap admin-password-wrap">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  className="password-visibility-button"
                  type="button"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button className="primary-button" type="submit">Iniciar sesión</button>
              <button
                className="reader-auth-resend"
                type="button"
                onClick={sendPasswordReset}
                disabled={sendingReset}
              >
                {sendingReset ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
              </button>
            </form>
            {error && <p className="error-message" role="alert">{error}</p>}
          </section>
        ) : isAuthor && audience === 'super_admin' ? (
          <Navigate to="/author" replace />
        ) : isSuperAdmin && audience === 'author' ? (
          <Navigate to="/" replace />
        ) : !canManageBooks ? (
          <section className="login-card">
            <div className="upload-illustration"><FileText size={27} strokeWidth={1.7} /></div>
            <h2>Esta cuenta no puede publicar libros</h2>
            <p className="upload-description">Puedes acceder a tu biblioteca de lector y a los libros que hayas guardado.</p>
            <a className="primary-button" href="/library">Ir a mi biblioteca</a>
          </section>
        ) : (
          <>
            {activeView === 'dashboard' ? (
              <>
                <div className="dashboard-heading">
                  <div>
                    <p className="eyebrow">{isSuperAdmin ? 'BIBLIOTECA COMPLETA' : 'TUS PUBLICACIONES'}</p>
                    <h2>{isSuperAdmin ? 'Todos los libros' : 'Mis libros'}</h2>
                    <p>
                      {isSuperAdmin
                        ? 'Administra todos los libros y comparte cada publicación mediante un enlace o código QR.'
                        : 'Administra tus propios libros y comparte cada publicación mediante un enlace o código QR.'}
                    </p>
                  </div>
                  <div className="dashboard-heading-actions">
                    {isSuperAdmin && (
                      <a className="secondary-button" href="/users">
                        <ShieldCheck size={16} />
                        Usuarios y roles
                      </a>
                    )}
                    <button className="primary-button" onClick={startNewBook}>
                      <Plus size={17} />
                      Nuevo libro digital
                    </button>
                  </div>
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
                    <p className="upload-description">Agrega un libro digital para crear un enlace de lectura.</p>
                    <button className="primary-button" onClick={startNewBook}>
                      <Plus size={17} />
                      Agregar nuevo libro digital
                    </button>
                  </section>
                ) : (
                  <section className="book-catalog" aria-labelledby="catalog-title">
                    <div className="catalog-heading">
                      <h2 id="catalog-title">{isSuperAdmin ? 'Libros de la plataforma' : 'Mis publicaciones'}</h2>
                      <span className="catalog-count">{books.length}</span>
                    </div>
                    <ul className="book-list">
                      {books.map((book) => (
                        <li className="book-list-item" key={book.id}>
                          <div className="book-list-info">
                            <span className="book-list-icon">
                              {book.cover_url
                                ? <img src={book.cover_url} alt="" />
                                : <BookOpen size={17} />}
                            </span>
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
                              onClick={() => openQr(book)}
                              aria-label={`Generar código QR para ${book.title}`}
                              title="Ver código QR"
                            >
                              <QrCode size={17} />
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
                      coverImage={coverPreview || editingBook?.cover_url || ''}
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
                          <div className="share-actions">
                            <button className="icon-button" onClick={copyShareLink} aria-label="Copiar enlace" title="Copiar enlace">
                              {copied ? <Check size={18} /> : <Copy size={18} />}
                            </button>
                            <button
                              className="secondary-button qr-button"
                              onClick={() => openQr({
                                id: '',
                                slug: decodeURIComponent(new URL(shareUrl).pathname.split('/').pop()),
                                title: bookTitle,
                              })}
                            >
                              <QrCode size={16} />
                              Ver QR
                            </button>
                          </div>
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
            {qrBook && (
              <div
                className="modal-backdrop"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setQrBook(null)
                }}
              >
                <section
                  className="qr-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="qr-modal-title"
                >
                  <div className="catalog-heading">
                    <div>
                      <p className="eyebrow">ENLACE COMPARTIBLE</p>
                      <h2 id="qr-modal-title">Código QR</h2>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setQrBook(null)}
                      aria-label="Cerrar código QR"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <p className="qr-book-title">{qrBook.title}</p>
                  <div className="qr-code-frame">
                    <QRCodeSVG
                      ref={qrCodeRef}
                      className="share-qr-code"
                      value={createShareUrl(qrBook)}
                      size={220}
                      level="H"
                      marginSize={4}
                      bgColor="transparent"
                    />
                  </div>
                  <p className="qr-modal-copy">Escanea este código para abrir el libro.</p>
                  {qrDownloadError && (
                    <p className="error-message upload-error" role="alert">{qrDownloadError}</p>
                  )}
                  <div className="metadata-form-actions">
                    <button className="primary-button" type="button" onClick={copyQrLink}>
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {copied ? 'Enlace copiado' : 'Copiar enlace'}
                    </button>
                    <button
                      className="secondary-button qr-button"
                      type="button"
                      onClick={handleDownloadQr}
                      disabled={downloadingQr}
                    >
                      <Download size={16} />
                      {downloadingQr ? 'Preparando PNG…' : 'Descargar PNG'}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setQrBook(null)}
                    >
                      Cerrar
                    </button>
                  </div>
                </section>
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
