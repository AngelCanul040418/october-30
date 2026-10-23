import { BookOpen, LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'

function SiteHeader({ note, onSignOut, homeHref = '/' }) {
  return (
    <header className="topbar">
      <Link className="brand" to={homeHref} aria-label="Biblioteca, inicio">
        <span className="brand-mark"><BookOpen size={19} strokeWidth={2.2} /></span>
        <span>Biblioteca</span>
      </Link>
      <div className="topbar-right">
        <div className="topbar-note">
          <span className="status-dot" />
          {note}
        </div>
        {onSignOut && (
          <button className="signout-button" onClick={onSignOut}>
            <LogOut size={15} />
            Salir
          </button>
        )}
      </div>
    </header>
  )
}

export default SiteHeader
