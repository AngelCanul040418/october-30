import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import './styles/App.css'

const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const ReaderLibraryPage = lazy(() => import('./pages/ReaderLibraryPage.jsx'))
const SetPasswordPage = lazy(() => import('./pages/SetPasswordPage.jsx'))
const SharedBookPage = lazy(() => import('./pages/SharedBookPage.jsx'))
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage.jsx'))
const UserManagementPage = lazy(() => import('./pages/UserManagementPage.jsx'))

function NotFoundPage() {
  return (
    <main className="app-shell">
      <div className="empty-state">
        <h1>Esta página no existe</h1>
        <Link to="/">Volver al panel</Link>
      </div>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="page-loading"><span className="spinner" /> Cargando…</div>}>
        <Routes>
          <Route path="/" element={<SuperAdminPage />} />
          <Route path="/author" element={<AdminPage audience="author" />} />
          <Route path="/books" element={<AdminPage audience="super_admin" />} />
          <Route path="/users" element={<UserManagementPage />} />
          <Route path="/book/:bookSlug" element={<SharedBookPage />} />
          <Route path="/library" element={<ReaderLibraryPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/reset-password" element={<SetPasswordPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
