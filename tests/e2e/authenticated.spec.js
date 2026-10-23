/* global process */

import { expect, test } from '@playwright/test'

const readerCredentials = {
  email: process.env.E2E_READER_EMAIL,
  password: process.env.E2E_READER_PASSWORD,
}
const readerBookSlug = process.env.E2E_BOOK_SLUG

const superAdminCredentials = {
  email: process.env.E2E_SUPER_ADMIN_EMAIL,
  password: process.env.E2E_SUPER_ADMIN_PASSWORD,
}

const authorCredentials = {
  email: process.env.E2E_AUTHOR_EMAIL,
  password: process.env.E2E_AUTHOR_PASSWORD,
}

async function signInReader(page, credentials) {
  await page.goto('/library')
  await page.getByLabel('Correo electrónico').fill(credentials.email)
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(credentials.password)
  await page.getByRole('button', { name: 'Entrar a mi biblioteca' }).click()
  await expect(page.getByRole('heading', { name: 'Mi biblioteca' })).toBeVisible()
}

async function signInAdmin(page, path, credentials) {
  await page.goto(path)
  await page.getByLabel('Correo electrónico').fill(credentials.email)
  await page.getByLabel('Contraseña de la cuenta').fill(credentials.password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

function getBookPath(value) {
  const normalizedValue = value.trim().replace(/^\/+|\/+$/g, '')
  return normalizedValue.startsWith('book/')
    ? `/${normalizedValue}`
    : `/book/${encodeURIComponent(normalizedValue)}`
}

test.describe('Flujos autenticados de lector', () => {
  test.skip(
    !readerCredentials.email || !readerCredentials.password,
    'Configura E2E_READER_EMAIL y E2E_READER_PASSWORD para ejecutar esta suite.',
  )

  test('inicia sesión y muestra la biblioteca del lector', async ({ page }) => {
    await signInReader(page, readerCredentials)

    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByRole('heading', { name: 'Mi biblioteca' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible()
  })

  test('mantiene al lector fuera de las vistas administrativas', async ({ page }) => {
    await signInReader(page, readerCredentials)

    await page.goto('/')
    await expect(page).toHaveURL(/\/library$/)
    await page.goto('/author')
    await expect(page.getByRole('heading', { name: 'Esta cuenta no puede publicar libros' })).toBeVisible()
    await page.goto('/users')
    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible()
  })

  test.skip(
    !readerBookSlug,
    'Configura E2E_BOOK_SLUG con un libro que el lector ya tenga guardado.',
  )

  test('abre un libro guardado y permite usar sus controles', async ({ page }) => {
    await signInReader(page, readerCredentials)
    await page.goto(getBookPath(readerBookSlug))

    await expect(page.getByRole('button', { name: 'Abrir mi libro' })).toBeVisible()
    await page.getByRole('button', { name: 'Abrir mi libro' }).click()
    await expect(page.getByRole('region', { name: 'Lector de PDF' })).toBeVisible()
    await expect(page.getByRole('slider', { name: 'Seleccionar página' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ver en pantalla completa' })).toBeVisible()

    const reader = page.getByRole('region', { name: 'Lector de PDF' })
    await expect(reader.locator('.document-meta')).toContainText('páginas', { timeout: 15000 })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('slider', { name: 'Seleccionar página' })).toHaveAttribute('aria-valuetext', /Página/)
  })
})

test.describe('Flujos autenticados administrativos', () => {
  test.skip(
    !superAdminCredentials.email || !superAdminCredentials.password,
    'Configura E2E_SUPER_ADMIN_EMAIL y E2E_SUPER_ADMIN_PASSWORD para probar super administración.',
  )

  test('inicia sesión y muestra el centro de control', async ({ page }) => {
    await signInAdmin(page, '/', superAdminCredentials)

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Bienvenido, super administrador' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Usuarios y roles' })).toBeVisible()
  })
})

test.describe('Flujo autenticado de autor', () => {
  test.skip(
    !authorCredentials.email || !authorCredentials.password,
    'Configura E2E_AUTHOR_EMAIL y E2E_AUTHOR_PASSWORD para probar el panel de autor.',
  )

  test('inicia sesión y muestra el panel de autor', async ({ page }) => {
    await signInAdmin(page, '/author', authorCredentials)

    await expect(page).toHaveURL(/\/author$/)
    await expect(page.getByRole('heading', { name: 'Nuevo libro digital' })).toBeVisible()
  })
})
