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
2. Ejecuta todo el SQL actualizado de [`supabase/setup.sql`](./supabase/setup.sql) desde el SQL Editor de Supabase. Si ya lo ejecutaste antes, vuelve a ejecutarlo para migrar los slugs, nombres originales y portadas, y habilitar la lectura de enlaces por título.
3. En Supabase Auth, crea manualmente tu cuenta administradora y desactiva el registro público.
4. Ejecuta `npm run dev` e inicia sesión en el panel con esa cuenta.

El panel de administración requiere sesión. La vista principal es una biblioteca con tus libros; desde «Nuevo libro digital» se abre el flujo para subir un PDF, una portada opcional y completar título, subtítulo, descripción y autor. Los datos de un libro existente se editan en un modal. El enlace `/book/<titulo>` permite abrir el libro y mostrar esos detalles sin una cuenta de lector; desde el panel también puedes generar un código QR. Los enlaces UUID anteriores siguen funcionando. Los PDF y las portadas se almacenan en el bucket público `books`, pero el catálogo y las acciones de administración requieren la sesión propietaria. No uses enlaces compartidos para documentos confidenciales: quien obtenga el enlace tendrá acceso.

## Producción

```sh
npm run build
npm run preview
```

En Vercel, agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como variables de entorno para Production, Preview y Development. La clave publishable está diseñada para el cliente y las políticas de Storage limitan las subidas a usuarios autenticados. Nunca pongas una clave `secret`, la contraseña de la base de datos ni una clave `service_role` en el frontend, en estas variables o en Git.
