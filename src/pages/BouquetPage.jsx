import { useEffect, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'

const BOOK_LINK = 'https://machape.site/book/october-30'

function Gerbera({ className = '' }) {
  return (
    <g className={`bouquet-flower gerbera ${className}`}>
      {Array.from({ length: 16 }, (_, index) => (
        <ellipse
          key={index}
          className="gerbera-petal"
          cx="0"
          cy="-20"
          rx="5"
          ry="16"
          transform={`rotate(${index * 22.5})`}
        />
      ))}
      <circle className="flower-center gerbera-center" r="9" />
      <circle className="flower-center-dot" r="3" />
    </g>
  )
}

function Rose({ className = '' }) {
  return (
    <g className={`bouquet-flower rose ${className}`}>
      <path className="rose-petal rose-petal-outer" d="M0-27c-17-2-25 10-17 22 7 11 28 11 35-1 7-12-2-20-18-21Z" />
      <path className="rose-petal rose-petal-mid" d="M0-20c-11-8-22 2-13 13 7 8 20 8 27 0 7-9-2-17-14-13Z" />
      <path className="rose-petal rose-petal-inner" d="M-2-14c-7-4-12 4-5 9 6 4 13 1 14-5 1-5-4-7-9-4Z" />
    </g>
  )
}

function Tulip({ className = '' }) {
  return (
    <g className={`bouquet-flower tulip ${className}`}>
      <path className="tulip-head" d="M-21-23c7 3 13 2 21-6 8 8 14 9 21 6 2 20-6 31-21 31s-23-11-21-31Z" />
      <path className="tulip-notch" d="M0-29v8" />
    </g>
  )
}

function Lily({ className = '' }) {
  return (
    <g className={`bouquet-flower lily ${className}`}>
      <path className="lily-petal" d="M0 0C-22-4-30-18-23-31-10-29-2-18 0 0Z" />
      <path className="lily-petal" d="M0 0C22-4 30-18 23-31 10-29 2-18 0 0Z" />
      <path className="lily-petal" d="M0 0C-5-22 1-37 12-43 17-28 12-12 0 0Z" />
      <path className="lily-petal" d="M0 0C5-22-1-37-12-43-17-28-12-12 0 0Z" />
      <circle className="lily-center" cy="-5" r="7" />
    </g>
  )
}

function Sunflower({ className = '' }) {
  return (
    <g className={`bouquet-flower sunflower ${className}`}>
      {Array.from({ length: 12 }, (_, index) => (
        <ellipse
          key={index}
          className="sunflower-petal"
          cx="0"
          cy="-21"
          rx="7"
          ry="18"
          transform={`rotate(${index * 30})`}
        />
      ))}
      <circle className="flower-center sunflower-center" r="11" />
      <circle className="flower-center-dot sunflower-dot" r="5" />
    </g>
  )
}

function Daisy({ className = '' }) {
  return (
    <g className={`bouquet-flower daisy ${className}`}>
      {Array.from({ length: 10 }, (_, index) => (
        <ellipse
          key={index}
          className="daisy-petal"
          cx="0"
          cy="-17"
          rx="6"
          ry="14"
          transform={`rotate(${index * 36})`}
        />
      ))}
      <circle className="flower-center daisy-center" r="8" />
    </g>
  )
}

function BouquetPage() {
  const [started, setStarted] = useState(false)
  const [showMessage, setShowMessage] = useState(false)
  const [showBookLink, setShowBookLink] = useState(false)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Un ramo para ti'

    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    if (!started) return undefined

    const messageTimer = window.setTimeout(() => setShowMessage(true), 3000)
    const bookTimer = window.setTimeout(() => setShowBookLink(true), 3900)

    return () => {
      window.clearTimeout(messageTimer)
      window.clearTimeout(bookTimer)
    }
  }, [started])

  return (
    <main className={`bouquet-page${started ? ' is-started' : ''}`}>
      {!started && (
        <section className="bouquet-welcome" aria-labelledby="bouquet-welcome-title">
          <Sparkles className="bouquet-welcome-sparkle" size={22} aria-hidden="true" />
          <p className="bouquet-eyebrow">Hay un pequeño detalle para ti</p>
          <h1 id="bouquet-welcome-title">Un ramo para ti</h1>
          <p>Cuando estés lista, presiona iniciar.</p>
          <button className="bouquet-start-button" type="button" onClick={() => setStarted(true)}>
            Iniciar
          </button>
        </section>
      )}

      <div className="bouquet-stars" aria-hidden="true">
        <Sparkles className="bouquet-star star-one" size={18} />
        <Sparkles className="bouquet-star star-two" size={12} />
        <Sparkles className="bouquet-star star-three" size={15} />
        <span className="bouquet-ambient-petal ambient-petal-one" />
        <span className="bouquet-ambient-petal ambient-petal-two" />
        <span className="bouquet-ambient-petal ambient-petal-three" />
        <span className="bouquet-ambient-petal ambient-petal-four" />
        <span className="bouquet-ambient-petal ambient-petal-five" />
        <span className="bouquet-firefly firefly-one" />
        <span className="bouquet-firefly firefly-two" />
        <span className="bouquet-firefly firefly-three" />
        <span className="bouquet-firefly firefly-four" />
        <span className="bouquet-firefly firefly-five" />
        <span className="bouquet-firefly firefly-six" />
        <span className="bouquet-sky-star sky-star-one" />
        <span className="bouquet-sky-star sky-star-two" />
        <span className="bouquet-sky-star sky-star-three" />
        <span className="bouquet-sky-star sky-star-four" />
        <span className="bouquet-sky-star sky-star-five" />
        <span className="bouquet-sky-star sky-star-six" />
        <span className="bouquet-sky-star sky-star-seven" />
        <span className="bouquet-sky-star sky-star-eight" />
        <span className="bouquet-sky-star sky-star-nine" />
        <span className="bouquet-sky-star sky-star-ten" />
      </div>

      <section className="bouquet-card" aria-labelledby="bouquet-title">
        <p className="bouquet-eyebrow">Un detalle hecho especialmente para ti</p>
        <h1 id="bouquet-title">Un ramo para ti</h1>
        <p className="bouquet-copy">
          Flores, colores y un pequeño rincón hecho con cariño.
        </p>

        <div className="bouquet-scene">
          <div className="bouquet-glow" aria-hidden="true" />
          <svg
            className="bouquet-art"
            viewBox="0 0 520 520"
            role="img"
            aria-label="Ramo animado de gerberas, tulipanes, rosas, lirios, girasoles y margaritas"
          >
            <defs>
              <linearGradient id="stem-gradient" x1="0" x2="1">
                <stop offset="0" stopColor="#37634e" />
                <stop offset="1" stopColor="#79a16e" />
              </linearGradient>
              <linearGradient id="wrap-gradient" x1="0" x2="1">
                <stop offset="0" stopColor="#c98c9e" />
                <stop offset="0.5" stopColor="#f1c9d1" />
                <stop offset="1" stopColor="#b8748e" />
              </linearGradient>
            </defs>

            <g className="bouquet-stems" fill="none" stroke="url(#stem-gradient)" strokeLinecap="round">
              <path className="stem stem-one" d="M260 449C245 340 205 300 180 228" />
              <path className="stem stem-two" d="M265 449C265 320 261 275 260 178" />
              <path className="stem stem-three" d="M273 449C295 335 355 300 397 208" />
              <path className="stem stem-four" d="M270 449C235 345 230 285 205 218" />
              <path className="stem stem-five" d="M275 449C315 350 331 290 330 225" />
              <path className="stem stem-six" d="M279 449C347 382 390 320 421 260" />
              <path className="stem stem-seven" d="M258 449C220 330 174 260 167 184" />
              <path className="stem stem-eight" d="M270 449C287 340 296 270 293 177" />
              <path className="stem stem-nine" d="M280 449C330 350 368 280 365 198" />
              <path className="stem stem-ten" d="M264 449C245 360 218 310 218 267" />
              <path className="stem stem-eleven" d="M276 449C300 360 335 320 349 274" />
              <path className="stem stem-twelve" d="M266 449C250 370 245 330 246 292" />
              <path className="stem stem-thirteen" d="M275 449C292 375 307 335 309 292" />
              <path className="stem stem-fourteen" d="M260 449C225 380 199 350 190 315" />
              <path className="stem stem-fifteen" d="M282 449C326 380 350 350 374 322" />
              <path className="stem stem-sixteen" d="M258 449C205 365 157 310 144 236" />
              <path className="stem stem-seventeen" d="M267 449C231 340 207 270 188 202" />
              <path className="stem stem-eighteen" d="M273 449C267 330 260 245 252 164" />
              <path className="stem stem-nineteen" d="M278 449C303 340 315 255 320 170" />
              <path className="stem stem-twenty" d="M284 449C346 355 391 300 406 225" />
              <path className="stem stem-twenty-one" d="M255 449C214 355 166 320 150 226" />
              <path className="stem stem-twenty-two" d="M280 449C316 350 365 315 382 236" />
              <path className="stem stem-twenty-three" d="M270 449C246 340 224 285 218 235" />
              <path className="stem stem-twenty-four" d="M274 449C260 350 252 300 252 255" />
              <path className="stem stem-twenty-five" d="M278 449C305 350 323 305 330 255" />
              <path className="stem stem-twenty-six" d="M268 449C250 370 232 325 232 282" />
              <path className="stem stem-twenty-seven" d="M274 449C274 365 278 315 278 270" />
              <path className="stem stem-twenty-eight" d="M280 449C292 370 300 325 300 286" />
              <path className="stem stem-twenty-nine" d="M262 449C244 385 220 350 212 315" />
              <path className="stem stem-thirty" d="M285 449C310 385 326 350 334 315" />
            </g>

            <path className="bouquet-wrap-back" d="M126 350Q260 391 394 350L363 409Q260 448 157 409Z" />

            <g className="bouquet-leaves bouquet-leaves-back" fill="#4d7959">
              <path d="M216 365c-61-48-93-40-108-14 34 38 69 42 108 14Z" />
              <path d="M309 365c57-50 89-43 105-18-35 40-70 47-105 18Z" />
              <path d="M201 312c-49-43-77-38-91-18 30 35 57 42 91 18Z" />
              <path d="M331 316c48-45 77-39 91-19-30 37-58 43-91 19Z" />
            </g>
            <g className="bouquet-leaves" fill="#669267">
              <path d="M220 326c-44-34-65-27-75-11 25 26 49 30 75 11Z" />
              <path d="M310 342c42-38 66-32 77-16-26 29-50 34-77 16Z" />
              <path d="M238 281c-37-32-58-28-68-14 21 25 43 30 68 14Z" />
              <path d="M307 276c39-34 61-29 71-14-23 26-45 30-71 14Z" />
              <path d="M291 379c39-24 58-15 63 1-25 19-45 20-63-1Z" />
              <path d="M207 396c-48-28-69-17-75 2 31 24 53 23 75-2Z" />
              <path d="M323 397c47-30 68-20 75-2-29 26-52 25-75 2Z" />
              <path d="M250 350c-38-32-59-27-67-11 23 27 44 31 67 11Z" />
              <path d="M292 350c38-33 60-27 68-11-24 27-45 31-68 11Z" />
            </g>

            <g className="bouquet-stem-connectors" fill="none" stroke="url(#stem-gradient)" strokeLinecap="round">
              <path d="M180 228L180 275" />
              <path d="M260 196L260 245" />
              <path d="M397 225L397 270" />
              <path d="M150 245L150 282" />
              <path d="M382 257L382 290" />
              <path d="M218 256L218 292" />
              <path d="M252 276L252 310" />
              <path d="M330 276L330 310" />
            </g>

            <g className="bouquet-fillers-back">
              <g className="flower-position filler-left"><Daisy /></g>
              <g className="flower-position filler-right"><Daisy /></g>
              <g className="flower-position filler-top-left"><Rose /></g>
              <g className="flower-position filler-top-right"><Rose /></g>
            </g>

            <g className="flower-position flower-gerbera"><Gerbera /></g>
            <g className="flower-position flower-rose"><Rose /></g>
            <g className="flower-position flower-tulip"><Tulip /></g>
            <g className="flower-position flower-lily"><Lily /></g>
            <g className="flower-position flower-sunflower"><Sunflower /></g>
            <g className="flower-position flower-daisy"><Daisy /></g>
            <g className="flower-position flower-large-left"><Gerbera /></g>
            <g className="flower-position flower-large-right"><Rose /></g>
            <g className="flower-position flower-large-center"><Sunflower /></g>
            <g className="flower-position flower-large-lily-left"><Lily /></g>
            <g className="flower-position flower-large-lily-right"><Lily /></g>
            <g className="flower-position flower-center-large"><Gerbera /></g>
            <g className="flower-position flower-center-medium-left"><Rose /></g>
            <g className="flower-position flower-center-medium-right"><Tulip /></g>
            <g className="flower-position flower-center-small-left"><Daisy /></g>
            <g className="flower-position flower-center-small"><Daisy /></g>
            <g className="flower-position flower-center-small-right"><Rose /></g>
            <g className="flower-position flower-side-rose"><Rose /></g>
            <g className="flower-position flower-side-tulip"><Tulip /></g>
            <g className="flower-position flower-side-daisy"><Daisy /></g>
            <g className="flower-position flower-extra-left"><Daisy /></g>
            <g className="flower-position flower-extra-center"><Rose /></g>
            <g className="flower-position flower-extra-right"><Lily /></g>
            <g className="flower-position flower-extra-lower-left"><Tulip /></g>
            <g className="flower-position flower-extra-lower-right"><Gerbera /></g>
            <g className="flower-position flower-fill-left"><Rose /></g>
            <g className="flower-position flower-fill-left-small"><Daisy /></g>
            <g className="flower-position flower-fill-center-left"><Tulip /></g>
            <g className="flower-position flower-fill-center-right"><Daisy /></g>
            <g className="flower-position flower-fill-right"><Rose /></g>
            <g className="flower-position flower-fill-right-small"><Lily /></g>
            <g className="bouquet-fillers-front">
              <g className="flower-position filler-front-left"><Daisy /></g>
              <g className="flower-position filler-front-center"><Daisy /></g>
              <g className="flower-position filler-front-right"><Daisy /></g>
              <g className="flower-position filler-front-rose"><Rose /></g>
            </g>

            <path className="bouquet-wrap-shadow" d="M139 365Q260 414 381 365L348 437Q260 472 172 437Z" />
            <path className="bouquet-wrap" d="M146 360Q260 405 374 360L302 487Q260 505 218 487Z" />
            <path className="bouquet-wrap-side bouquet-wrap-side-left" d="M146 360L218 487 183 459Z" />
            <path className="bouquet-wrap-side bouquet-wrap-side-right" d="M374 360L302 487 337 459Z" />
            <path className="bouquet-wrap-fold" d="M146 360Q260 408 374 360" />
            <path className="bouquet-wrap-fold wrap-fold-left" d="M175 375L225 490" />
            <path className="bouquet-wrap-fold wrap-fold-right" d="M345 375L295 490" />
            <path className="bouquet-wrap-fold wrap-fold-center" d="M260 407L260 499" />
            <path className="bouquet-wrap-shine" d="M198 393Q260 425 322 393" />
            <path className="bouquet-wrap-edge" d="M153 364Q260 407 367 364" />
            <path className="bouquet-ribbon" d="M259 449c-5 25-24 34-41 35 10-17 11-28 7-43Z" />
            <path className="bouquet-ribbon" d="M265 449c8 26 27 33 44 34-11-16-13-28-9-43Z" />
          </svg>
        </div>

        <p className={`bouquet-message${showMessage ? ' is-visible' : ''}`}>
          El mensaje especial aparecerá aquí.
        </p>

        <a
          className={`bouquet-book-button${showBookLink ? ' is-visible' : ''}${BOOK_LINK ? '' : ' is-disabled'}`}
          href={BOOK_LINK || undefined}
          aria-disabled={!BOOK_LINK}
          onClick={(event) => {
            if (!BOOK_LINK) event.preventDefault()
          }}
        >
          Abrir el libro
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </section>
    </main>
  )
}

export default BouquetPage
