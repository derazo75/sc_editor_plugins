# scriptcase-tools-editor-toolkit
====================================

This Userscript (Tampermonkey) enhances the native **Scriptcase** editor by adding functionalities that streamline development, incorporating critical productivity features, professional formatting, and Artificial Intelligence (AI) assistance.

* * * * *

🛠 Installation
---------------

1.  **Install Tampermonkey**: Download the extension for your browser (Chrome, Edge, Firefox).

2.  **Enable Scripts**: Ensure userscripts are enabled in the Tampermonkey dashboard.

3.  **Create New Script**: In the Tampermonkey control panel, click the **"+" (Add new script)** button.

4.  **Paste Code**: Delete the initial content and paste the code from `scriptcase-hack.js`.

5.  **Configure Snippets**: The script looks for a remote `snippets.json` file. Ensure you configure your repository URL.

6.  **Start Backend**: Run the Python server (`editor_sc_v0.2.py`) to enable the Linter and certain autocomplete functions (Not required for other features).

7.  **GROQ apiKey**: On line 33 of `scriptcase-hack.js`, place your GROQ APIKEY (<https://groq.com/>).

* * * * *

🚀 Main Features
----------------

### 🎨 Advanced Interface and Navigation

-   **Indent Guides**: Vertical block lines have been added to visually connect opening and closing braces, facilitating the reading of nested structures.

-   **Bracket Matching Pro**: High-contrast color highlighting for braces `{}` and parentheses `()`.

-   **Selection Highlight**: Automatic highlighting of all occurrences of a variable upon selection.

### ✍️ Intelligent Editing and Documentation

-   **Automatic Comments**: When pressing `Enter` within a comment block (`/* ... */`), the editor automatically inserts the `*` prefix on the new line, accelerating documentation writing.

-   **PHPDoc Highlighting**: Special support for documentation annotations. Tags such as `@author`, `@param`, `@return`, `@var`, and `@throws` are now highlighted with a distinctive color to differentiate metadata from descriptions.

-   **Auto-Close**: Automatic closing of parentheses, braces, and brackets as you type.

### 🧠 AI Assistance (Groq / Llama 3)

Use `Alt + Shift + K` to process instructions via comments:

-   **Standard PHP Mode (`// instruction`)**: Optimized for pure PHP 8.2 with strict use of FQN.

    -   Optimized for **PHP 8.2** logic.

    -   Strict use of **FQN** (Fully Qualified Names).

    -   Blockage of `use` statements.

-   **Scriptcase Pro Mode (`//SC instruction`)**: Deep context of macros, `{}` fields, and `[]` globals.

    -   Full **Scriptcase 9.1** context.

    -   Handling of `{field}` fields, `[variable]` globals, and macros.

    -   Automatic technical differentiation between `sc_select` and `sc_lookup`.

### 🔧 Server Tools (Backend)

-   **Linter (Alt + Shift + S)**: Real-time syntax validation using the local PHP binary.

-   **IntelliSense**: Intelligent autocomplete when detecting `->` or `::` operators and access to internal library functions (`Alt + Shift + A`).

* * * * *

⌨️ Keyboard Shortcuts (Keymaps)
-------------------------------

| **Combination** | **Action** | **Requirement** |
| --- | --- | --- |
| `Alt + Shift + K` | **IA Magic**: Executes the comment task or processes selected code. |  |
| `Alt + Shift + S` | **Check Syntax**: Runs the linter to find errors. | PYTHON SERVER |
| `Shift + Alt + F` | **Prettier PHP Plugin**: Visually re-indents all code in the editor. |  |
| `Ctrl + Alt + Space` | **Snippets**: Opens the dynamic code snippet searcher. |  |
| `Alt + Shift + A` | **Internal Libs**: Suggests functions and methods from Scriptcase libraries. | PYTHON SERVER |
| instance-> or class:: | **Classes**: Suggests functions and methods for classes and instances. | PYTHON SERVER |

* * * * *

The Python server requires the following parameters to operate advanced functions:
----------------------------------------------------------------------------------

JSON

```
{
  "PHP_PATH": "/usr/bin/php",
  "RUTAS_LIBS": ["/var/www/apache2/scriptcase/devel/conf/sys/libraries", "/var/www/apache2/scriptcase/devel/conf/sys/lib", "/var/www/apache2/scriptcase/devel/conf/grp/MyProject/lib"]
}
```
