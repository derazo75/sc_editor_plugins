# Scriptcase CodeMirror 5 Pro Enhancer

Este Script de Usuario (Tampermonkey) agrega al editor nativo de **Scriptcase** funcionalidades que facilitan el desarrollo, añadiendo funcionalidades críticas de productividad, formateo profesional y asistencia por Inteligencia Artificial (IA).

---

## 🛠 Instalación

1.  **Instalar Tampermonkey**: Descarga la extensión para tu navegador (Chrome, Edge, Firefox).
2.  **Activar Scripts**: Asegúrate de que los scripts de usuario estén activados en el panel de Tampermonkey.
3.  **Crear Nuevo Script**: En el panel de control de Tampermonkey, haz clic en el botón **"+" (Añadir nuevo script)**.
4.  **Pegar Código**: Borra el contenido inicial y pega el código de `scriptcase-hack-editor.js`.
5.  **Configurar Snippets**: El script busca un archivo `snippets.json` remoto. Asegúrate de configurar la URL de tu repositorio.
6.  **Levantar Backend**: Ejecuta el servidor Python (`editor_sc_v0.2.py`) para habilitar IA y Linter (No es necesario para las demás características).
7.  **apiKey GROQ:** en la linea 32 de scriptcase-hack.js coloque su APIKEY de GROQ (https://groq.com/)

---

## 🚀 Características Principales

### 🎨 Interfaz y Navegación Avanzada
* **Guías de Indentación (Indent Guides)**: Se han añadido líneas verticales de bloque que conectan visualmente la apertura y el cierre de llaves, facilitando la lectura de estructuras anidadas.
* **Bracket Matching Pro**: Resaltado de llaves `{}` y paréntesis `()` con colores de alto contraste.
* **Selection Highlight**: Resaltado automático de todas las ocurrencias de una variable al seleccionarla.

### ✍️ Edición y Documentación Inteligente
* **Comentarios Automáticos**: Al presionar `Enter` dentro de un bloque de comentario (`/* ... */`), el editor inserta automáticamente el prefijo `* ` en la nueva línea, agilizando la redacción de documentación.
* **Resaltado de PHPDoc**: Soporte especial para anotaciones de documentación. Etiquetas como `@author`, `@param`, `@return`, `@var` y `@throws` ahora se resaltan con un color distintivo para diferenciar metadatos de las descripciones.
* **Auto-Cierre**: Cierre automático de paréntesis, llaves y corchetes mientras escribes.

### 🧠 Asistencia por IA (Groq / Llama 3)

Usa `Alt + Shift + K` para procesar instrucciones mediante comentarios:

* **Modo PHP Estándar (`// instrucción`)**: Optimizado para PHP 8.2 puro con uso estricto de FQN. 
    * Optimizado para lógica **PHP 8.2**.
    * Uso estricto de **FQN** (nombres de clase completos).
    * Bloqueo de sentencias `use`.
* **Modo Scriptcase Pro (`//SC instrucción`)**:  Contexto profundo de macros, campos `{}` y globales `[]`.
    * Contexto completo de **Scriptcase 9.1**.
    * Manejo de campos `{campo}`, globales `[variable]` y macros.
    * Diferenciación técnica automática entre `sc_select` y `sc_lookup`.


### 🔧 Herramientas del Servidor (Backend)
* **Linter (Alt + Shift + S)**: Validación de sintaxis en tiempo real usando el binario de PHP local.
* **IntelliSense**: Autocompletado inteligente al detectar operadores `->` o `::` y acceso a funciones de librerías internas (`Alt + Shift + A`).

---

## ⌨️ Atajos de Teclado (Keymaps)

| Combinación | Acción | Requerimiento |
| :--- | :--- | :--- |
| `Alt + Shift + K` | **IA Magic**: Ejecuta la tarea del comentario o procesa el código seleccionado. |  |
| `Alt + Shift + S` | **Check Syntax**: Ejecuta el linter para buscar errores. | SERVIDOR PYTHON |
| `Shift + Alt + F` | **Prettier PHP Plugin**: Re-indenta visualmente todo el código del editor. | |
| `Ctrl + Alt + Space`| **Snippets**: Abre el buscador dinámico de fragmentos de código. | |
| `Alt + Shift + A` | **Internal Libs**: Sugiere funciones y métodos de librerías de Scriptcase. | SERVIDOR PYTHON |
| instancia-> o clase:: | **Clases**: Sugiere funciones y métodos de clases e instancias. | SERVIDOR PYTHON |

---

## El servidor Python requiere los siguientes parámetros para operar las funciones avanzadas:

```json
{
  "PHP_PATH": "/usr/bin/php",
  "RUTAS_LIBS": ["/var/www/apache2/scriptcase/devel/conf/sys/libraries", "/var/www/apache2/scriptcase/devel/conf/sys/lib", "/var/www/apache2/scriptcase/devel/conf/grp/MyProject/lib"]
}
