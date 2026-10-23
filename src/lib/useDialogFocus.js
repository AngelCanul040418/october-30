import { useEffect, useRef } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useDialogFocus(dialogRef, isOpen, onEscape) {
  const escapeHandlerRef = useRef(onEscape)

  useEffect(() => {
    escapeHandlerRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return undefined

    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const focusableElements = () => [...dialog.querySelectorAll(focusableSelector)]
    const firstFocusable = focusableElements()[0]
    firstFocusable?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        escapeHandlerRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const elements = focusableElements()
      if (!elements.length) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
        previousFocus.focus()
      }
    }
  }, [dialogRef, isOpen])
}
