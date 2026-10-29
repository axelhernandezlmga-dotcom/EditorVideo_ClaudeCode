# Biblioteca

Clips de video, música y efectos de sonido, organizados en categorías. Se administra desde la app
(Biblioteca) o con `npm run biblioteca`.

- `biblioteca.json`: categorías y recursos (rutas relativas a `medios/`).
- `medios/`: las copias de los archivos importados (el original nunca se toca).
- `miniaturas/`, `fotogramas/`: generados.

Todo menos este archivo queda fuera de git: los clips suelen tener derechos de terceros. Para cargar tu
material en una instalación nueva: `npm run biblioteca -- importar <carpeta> --categoria "Nombre"`.
