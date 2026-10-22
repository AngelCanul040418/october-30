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
2. Despliega la versión del cliente que incluye autenticación y URLs firmadas y, en coordinación con ese despliegue, ejecuta el SQL actualizado de [`supabase/setup.sql`](./supabase/setup.sql) desde el SQL Editor de Supabase. El script migra los slugs, nombres originales y portadas, crea perfiles y bibliotecas, y cambia el bucket `books` a privado. **No ejecutes el SQL antes de desplegar el cliente actualizado**: el código anterior usa URLs públicas y dejará de poder leer los archivos cuando el bucket sea privado.
3. En Supabase Auth, crea tu cuenta administradora (o conserva la existente). El script promueve automáticamente a `admin` las cuentas que ya sean propietarias de libros. Si la cuenta administradora no tiene libros, asígnale manualmente el rol en el SQL Editor:

   ```sql
   update public.user_profiles
   set role = 'admin'
   where user_id = '<UUID de la cuenta en Authentication > Users>';
   ```

4. En Supabase Auth, habilita el proveedor Email y el registro de usuarios. Configura también las URL de redirección para tu dominio de Vercel y `http://localhost:5173/**`. El registro de lectores está disponible desde `/library` o al abrir un enlace compartido; si la confirmación por correo está activa, deberán confirmar la cuenta antes de iniciar sesión.
5. Ejecuta `npm run dev` e inicia sesión en el panel con la cuenta administradora.

El panel de administración requiere una sesión con rol `admin`. La vista `/library` permite a los lectores crear una cuenta, iniciar sesión, abrir los libros guardados y quitarlos de su biblioteca. Los enlaces `/book/<titulo>` y los enlaces UUID anteriores requieren sesión; al abrir un libro compartido, el lector puede guardarlo en su biblioteca para acceder al PDF. Los PDF y las portadas están en el bucket privado `books`; el cliente genera URLs firmadas de duración limitada solo para cuentas autorizadas. El rol de lector se asigna automáticamente y no permite subir ni administrar libros.

Cualquier persona que se registre y tenga un enlace compartido puede guardar ese libro en su biblioteca. Si en el futuro se necesita restringir el acceso a destinatarios específicos, habrá que agregar invitaciones o una relación explícita entre el libro y la cuenta destinataria.

## Producción

```sh
npm run build
npm run preview
```

En Vercel, agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como variables de entorno para Production, Preview y Development. La clave publishable está diseñada para el cliente; RLS y las políticas de Storage autorizan las operaciones. Nunca pongas una clave `secret`, la contraseña de la base de datos ni una clave `service_role` en el frontend, en estas variables o en Git.
