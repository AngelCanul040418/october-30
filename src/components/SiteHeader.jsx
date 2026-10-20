import { BookOpen, LogOut } from 'lucide-react'

function SiteHeader({ note, onSignOut }) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Biblioteca, inicio">
        <span className="brand-mark"><BookOpen size={19} strokeWidth={2.2} /></span>
        <span>Biblioteca</span>
      </a>
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
