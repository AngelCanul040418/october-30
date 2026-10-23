# Biblioteca de libros digitales

Panel privado para subir libros PDF y crear enlaces de lectura compartibles. El lector aplica una animación de giro de página.

## Tecnologías

- React + Vite
- PDF.js para renderizar y precargar páginas
- StPageFlip / React PageFlip para animar el giro físico de las hojas
- Lucide para los iconos y `qrcode.react` para crear códigos QR

## Estructura de `src`

- `App.jsx`: pantalla principal y estado de la aplicación
- `main.jsx`: punto de entrada de React
- `components/`: componentes reutilizables, como el lector PDF
- `pages/`: panel privado y página de lectura compartida
- `lib/`: cliente de Supabase
- `styles/`: estilos de la aplicación y estilos globales
- `assets/`: recursos estáticos

## Desarrollo local

```sh
npm install
npm run dev
```

1. Copia `.env.example` como `.env.local` y coloca la URL de tu proyecto Supabase y su clave `publishable`.
2. Despliega el cliente actualizado y aplica las migraciones formales con Supabase CLI. El archivo [`supabase/setup.sql`](./supabase/setup.sql) se conserva únicamente como referencia histórica; no lo ejecutes junto con las migraciones. Las migraciones preparan los perfiles y bibliotecas, mantienen el bucket `books` privado y actualizan automáticamente `updated_at` cuando cambia un libro. **Despliega el cliente antes de aplicar cambios de esquema** para que los enlaces firmados y los nuevos permisos estén disponibles juntos.
3. Los perfiles que tenían el rol `admin` se migran a `super_admin`. Para asignar ese rol manualmente a la cuenta inicial, usa el UUID de la cuenta desde Authentication > Users:

   ```sql
   update public.user_profiles
   set role = 'super_admin'
   where user_id = '<UUID de la cuenta en Authentication > Users>';
   ```

4. Despliega la función de gestión de usuarios. Instala e inicia sesión con Supabase CLI, después ejecuta:

   ```sh
   supabase secrets set APP_URL=https://tu-dominio-de-vercel.vercel.app
   supabase functions deploy manage-users
   ```

   La función usa las variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` del entorno de Supabase; la clave de servicio nunca debe agregarse a Vite ni al frontend.
5. En Supabase Auth, habilita el proveedor Email y permite el registro público para que los lectores puedan crear su cuenta desde un enlace compartido. Añade `https://tu-dominio-de-vercel.app/**` y `http://localhost:5173/**` a la lista de Redirect URLs para que, tras confirmar su correo, vuelvan al libro que estaban abriendo. Los nuevos registros reciben automáticamente el rol `reader`; los autores y super administradores se crean mediante invitación desde `/users`.
6. Ejecuta `npm run dev` e inicia sesión con la cuenta de super administrador.

### Pruebas autenticadas locales

Las pruebas autenticadas de Playwright no usan credenciales incluidas en el repositorio.
Para ejecutarlas, define temporalmente estas variables en la terminal o en un archivo
local ignorado por Git:

```powershell
$env:E2E_READER_EMAIL = 'lector-de-prueba@example.com'
$env:E2E_READER_PASSWORD = 'una-contraseña-local'
$env:E2E_BOOK_SLUG = 'slug-de-un-libro-ya-guardado'
$env:E2E_SUPER_ADMIN_EMAIL = 'admin-de-prueba@example.com'
$env:E2E_SUPER_ADMIN_PASSWORD = 'otra-contraseña-local'
$env:E2E_AUTHOR_EMAIL = 'autor-de-prueba@example.com'
$env:E2E_AUTHOR_PASSWORD = 'otra-contraseña-local'
npm run test:e2e
```

Las cuentas deben estar confirmadas en Supabase y tener el rol correspondiente.
Estas pruebas verifican inicio de sesión, navegación y, si se proporciona
`E2E_BOOK_SLUG`, la apertura y los controles de un libro que el lector ya tenga
guardado. No crean, editan ni eliminan libros. Borra las variables de la sesión
al terminar:

```powershell
Remove-Item Env:E2E_READER_EMAIL, Env:E2E_READER_PASSWORD, Env:E2E_BOOK_SLUG
Remove-Item Env:E2E_SUPER_ADMIN_EMAIL, Env:E2E_SUPER_ADMIN_PASSWORD
Remove-Item Env:E2E_AUTHOR_EMAIL, Env:E2E_AUTHOR_PASSWORD
```

### Migraciones de Supabase

El esquema inicial se creó antes de habilitar el historial de migraciones y se conserva en
[`supabase/setup.sql`](./supabase/setup.sql) como referencia de instalación. El archivo
[`supabase/migrations/20261023041831_baseline_existing_schema.sql`](./supabase/migrations/20261023041831_baseline_existing_schema.sql)
marca ese punto de partida sin volver a ejecutar el esquema existente. Los cambios nuevos
deben añadirse como migraciones incrementales. Para una reconstrucción limpia, las
migraciones posteriores a la línea base se organizan por responsabilidad: tablas,
perfiles y biblioteca, funciones de autenticación, RLS, Storage, funciones de
libros compartidos, normalización de metadatos y el trigger `updated_at`.

El historial remoto actual ya contiene la línea base y el trigger aplicado
anteriormente. Por eso, antes de ejecutar `supabase db push`, hay que revisar el
estado con `supabase migration list` y confirmar qué migraciones se desean aplicar.
El seeder [`supabase/seed.sql`](./supabase/seed.sql) se ejecuta después de invitar
y crear en Auth al superadministrador `acanul353@gmail.com`; nunca contiene
contraseñas.

## Roles y acceso

- `super_admin`: administra todos los libros y es la única persona que puede invitar cuentas, asignar roles, activar o desactivar usuarios y eliminar cuentas. No puede eliminarse a sí mismo ni borrar al último superadministrador activo.
- `author`: publica, edita y elimina únicamente sus propios libros; no puede acceder a `/users`.
- `reader`: puede crear su propia cuenta desde un enlace compartido, guardar libros y leer su biblioteca. No puede publicar libros.

El cliente protege las vistas por rol, la función `manage-users` exige una sesión superadministradora y las políticas RLS de Supabase aplican los permisos reales sobre las tablas y Storage. Desactivar una cuenta bloquea el inicio de sesión y las nuevas solicitudes a la base y Storage; no elimina sus libros ni su perfil. Eliminar una cuenta es permanente y también elimina sus libros, relaciones de biblioteca y archivos asociados. Las URLs firmadas que ya se hubieran emitido siguen funcionando hasta vencer (actualmente, en un máximo de 24 horas). Los PDF y las portadas permanecen en el bucket privado `books`. La recuperación de contraseña usa `/reset-password`; agrega `https://machape.site/reset-password` a las Redirect URLs permitidas en Supabase.

El enlace compartido funciona como acceso para reclamar el libro: el lector inicia sesión o crea una cuenta de lector desde esa página, y después puede guardar el libro en su biblioteca. La confirmación de cuenta usa el servicio de correo configurado en Supabase Auth. El SMTP predeterminado puede servir para una prueba pequeña, pero tiene límites de entrega; configura un SMTP propio si las confirmaciones deben llegar de forma fiable a cualquier persona. Si más adelante se requiere que solo destinatarios específicos puedan reclamar un enlace, habrá que agregar invitaciones vinculadas a cada libro.

## Producción

```sh
npm run build
npm run preview
```

En Vercel, agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como variables de entorno para Production, Preview y Development. La clave publishable está diseñada para el cliente; RLS y las políticas de Storage autorizan las operaciones. Nunca pongas una clave `secret`, la contraseña de la base de datos ni una clave `service_role` en el frontend, en estas variables o en Git.
