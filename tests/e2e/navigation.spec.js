import { expect, test } from '@playwright/test'

test.describe('Navegación pública y acceso de lectores', () => {
  test('muestra una página clara para rutas inexistentes', async ({ page }) => {
    await page.goto('/ruta-que-no-existe')

    await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Volver al panel' })).toHaveAttribute('href', '/')
  })

  test('solicita iniciar sesión en la biblioteca', async ({ page }) => {
    await page.goto('/library')

    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
    await expect(page.getByLabel('Correo electrónico')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Contraseña' })).toBeVisible()
  })

  test('informa cuando no hay un enlace activo para establecer contraseña', async ({ page }) => {
    await page.goto('/reset-password')

    await expect(page.getByRole('heading', { name: 'El enlace no está activo' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ir al inicio de sesión' })).toHaveAttribute('href', '/')
  })

  test('mantiene protegido el acceso administrativo', async ({ page }) => {
    await page.goto('/author')

    await expect(page.getByRole('heading', { name: 'Acceso privado' })).toBeVisible()
    await expect(page.getByLabel('Correo electrónico')).toBeVisible()
  })

  test('mantiene protegida la gestión de usuarios', async ({ page }) => {
    await page.goto('/users')

    await expect(page.getByRole('heading', { name: 'Inicia sesión para continuar' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ir al acceso' })).toHaveAttribute('href', '/')
  })

  test('muestra autenticación antes de cargar un libro compartido', async ({ page }) => {
    await page.goto('/book/libro-de-prueba')

    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
    await expect(page.getByText('Entra con tu cuenta para guardar y volver a leer los libros que te compartan.')).toBeVisible()
  })

  test('permite alternar la visibilidad de la contraseña', async ({ page }) => {
    await page.goto('/library')

    const password = page.getByRole('textbox', { name: 'Contraseña' })
    await password.fill('contraseña-de-prueba')
    await expect(password).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Mostrar contraseña' }).click()
    await expect(password).toHaveAttribute('type', 'text')
    await expect(page.getByRole('button', { name: 'Ocultar contraseña' })).toBeVisible()
  })

  test('muestra el formulario de recuperación sin pedir credenciales', async ({ page }) => {
    await page.goto('/library')

    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click()

    await expect(page.getByRole('heading', { name: 'Restablece tu contraseña' })).toBeVisible()
    await expect(page.getByText('Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Contraseña' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Enviar enlace de recuperación' })).toBeVisible()
  })

  test('permite cambiar entre iniciar sesión y crear una cuenta', async ({ page }) => {
    await page.goto('/library')

    await page.getByRole('button', { name: 'Crea una cuenta de lector' }).click()

    await expect(page.getByRole('heading', { name: 'Crea tu cuenta de lector' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear cuenta y continuar' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Contraseña' })).toHaveAttribute('autocomplete', 'new-password')
  })

})
