# Scriptcase CodeMirror 5 Pro Enhancer

Este Script de Usuario (Tampermonkey) transforma el editor nativo de **Scriptcase** en un entorno de desarrollo más potente, añadiendo funcionalidades críticas de productividad, formateo y navegación de código.

## 🛠 Instalación

1. **Instalar Tampermonkey**: Descarga la extensión para [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) u otro navegador basado en Chromium.
2. **Crear Nuevo Script**: Abre el panel de control de Tampermonkey, haz clic en el botón **"+" (Añadir nuevo script)**.
3. **Pegar Código**: Borra el contenido inicial y pega el código de `scriptcase-hack-editor.js` que se encuentra en este repositorio.
4. **Guardar**: Presiona `Ctrl + S` dentro del editor de Tampermonkey.
5. **Configurar Snippets**: Asegúrate de tener tu archivo `snippets.json` en la rama `main` de tu repositorio para la carga remota.
Asegurate de que los scripts de usuario están activados en tempermonkey

---

## Características Principales

### Interfaz y Navegación
* **Resaltado de Bloques**: Apertura y cierre de llaves `{}` y paréntesis `()` altamente visibles con colores contrastados para evitar errores de sintaxis.
* **Línea Activa**: Resaltado sutil de la línea donde se encuentra el cursor para mejorar el enfoque.
* **Highlight de Selección**: Al seleccionar una variable o palabra, se resaltan automáticamente todas sus ocurrencias en el archivo actual.

### Edición Inteligente
* **Auto-Cierre**: Cierre automático de paréntesis, llaves y corchetes.
* **Multiplexor HTML **: Resaltado de apertura y cierre de tags cuando trabajas fuera de php ?>.
* **PHP Documentor**: Resaltado especial para etiquetas de documentación como `@param`, `@return`, `@var`, entre otras, dentro de comentarios.
* **Continuación de Comentarios**: Al presionar `Enter` dentro de un comentario de bloque, se inserta automáticamente el asterisco en la nueva línea.

### Productividad y Formateo
* **Historial Persistente (Undo/Redo)**: Conserva el historial de cambios (`Ctrl + Z`) incluso después de guardar o recargar la aplicación en Scriptcase mediante `sessionStorage`.
* **Formateo Automático**: Re-indenta todo el código siguiendo estándares de limpieza con `Shift + Alt + G`.
* **Gestión de Espacios**: Reemplazo automático de TABS por 4 espacios para mantener la consistencia en el código.

---

## ⌨️ Atajos de Teclado (Keymaps)

| Combinación | Acción |
| :--- | :--- |
| **`Ctrl + Alt + Space`** | **Menú de Snippets**: Abre tu biblioteca personal cargada desde GitHub con buscador dinámico. |
| **`Shift + Alt + G`** | **Auto-Format**: Re-indenta y limpia todo el código del editor. |

---

## 🔗 Sincronización de Snippets
El script consume automáticamente un archivo JSON remoto, para tus propios snippets crea un snippets.json remoto y cambia edita el js de tampermonkey:

```json
{
  "foreach": "foreach ($0 as $key => $value) {\n    \n}",
  "printr": "echo '<pre>';\nprint_r($0);\necho '</pre>';"
}
