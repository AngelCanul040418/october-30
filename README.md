# Folio

Panel inicial para cargar y revisar localmente un PDF. La página de lectura para compartir con otra persona aún no está implementada.

## Tecnologías

- React + Vite
- React-PDF / PDF.js para mostrar documentos
- Motion para animar el cambio de página
- Lucide para los iconos

## Estructura de `src`

- `App.jsx`: pantalla principal y estado de la aplicación
- `main.jsx`: punto de entrada de React
- `components/`: componentes reutilizables, como el lector PDF
- `styles/`: estilos de la aplicación y estilos globales
- `assets/`: recursos estáticos

## Desarrollo local

```sh
npm install
npm run dev
```

Selecciona un PDF en el panel o arrástralo al área de carga. El documento se procesa en el navegador y no se sube ni se guarda en un servidor. El panel aún no tiene autenticación ni protección de acceso; no subas documentos privados.

## Producción

```sh
npm run build
npm run preview
```

El proyecto puede desplegarse en Vercel. Para guardar libros y generar enlaces compartibles habrá que conectar almacenamiento persistente. Supabase ofrece almacenamiento y base de datos; Vercel Blob es almacenamiento de archivos, no una base de datos.
