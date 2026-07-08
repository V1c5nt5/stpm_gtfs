# STPM GTFS Viewer v1.2.2

## Qué se incorporó

- Modo de comparación por mes, usando el GTFS más reciente disponible dentro de cada mes.
- Selector de modo entre comparación por archivo y comparación mensual.
- Interfaz más limpia y técnica, con jerarquía visual más cercana a un dashboard 2026.
- Estilos nuevos para tarjetas, pestañas, controles y resumen de comparación.
- Ajustes de compatibilidad visual para pantallas grandes y móviles.
- Versión y recursos actualizados a `v1.2.2`.

## Qué actualiza respecto de la base

- Conserva la lógica de rutas, paraderos, parámetros y simulación.
- Reutiliza el comparador ya existente para crear una capa mensual sobre la selección de feeds.
- Mantiene la carga desde `assets/js/app.js`, `assets/css/app.css` y `assets/js/gtfs-worker.js`.

## Criterio técnico aplicado

- La comparación mensual no asume un ZIP único por mes.
- Se selecciona el archivo más reciente dentro de cada mes disponible.
- La comparación sigue siendo determinista si cambia el orden de los archivos en GitHub.
