import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AdminPage from './pages/AdminPage.jsx'
import ReaderLibraryPage from './pages/ReaderLibraryPage.jsx'
import SetPasswordPage from './pages/SetPasswordPage.jsx'
import SharedBookPage from './pages/SharedBookPage.jsx'
import SuperAdminPage from './pages/SuperAdminPage.jsx'
import UserManagementPage from './pages/UserManagementPage.jsx'
import './styles/App.css'

function NotFoundPage() {
  return (
    <main className="app-shell">
      <div className="empty-state">
        <h1>Esta página no existe</h1>
        <a href="/">Volver al panel</a>
      </div>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SuperAdminPage />} />
        <Route path="/author" element={<AdminPage audience="author" />} />
        <Route path="/books" element={<AdminPage audience="super_admin" />} />
        <Route path="/users" element={<UserManagementPage />} />
        <Route path="/book/:bookSlug" element={<SharedBookPage />} />
        <Route path="/library" element={<ReaderLibraryPage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
