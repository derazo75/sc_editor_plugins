// ==UserScript==
// @name         Scriptcase - CodeMirror 5 Plugins
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Cierre de llaves, resaltado de línea y brackets para Scriptcase
// @author       Fernando erazo
// @match        *://localhost/*
// @match        *://127.0.0.1/*
// @match        *://localhost:8000/*
// @match        *://*/scriptcase/devel/*

// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/mode/xml/xml.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/mode/javascript/javascript.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/mode/css/css.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/mode/htmlmixed/htmlmixed.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/mode/php/php.min.js

// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/closebrackets.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/matchbrackets.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/search/match-highlighter.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/closetag.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/matchtags.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/mode/multiplex.min.js

// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/comment/continuecomment.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/comment/comment.min.js
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  "use strict";

  // --- ESTILOS VISUALES ---
  // Inyectamos el CSS base del plugin Active Line
  const activeLineCSS = GM_getResourceText("CM_CSS");
  GM_addStyle(activeLineCSS);

  // Personalización: Línea activa (azul muy tenue) y Brackets (rojo negrita)
  GM_addStyle(`
        .CodeMirror-activeline-background { background: rgba(0, 150, 255, 0.08) !important; }
        .CodeMirror-matchingbracket {color: #FF0000 !important;font-weight: bold !important;text-decoration: underline !important;border-bottom: 1px solid red;}
        .CodeMirror-matchingtag {background: rgba(255, 150, 0, 0.3) !important;border-bottom: 1px solid orange;border-top: 1px solid orange;}
        .cm-matchhighlight { background-color: rgba(255, 255, 0, 0.3) !important;}
        .cm-comment {color: #00FFFF !important; font-style: italic;opacity: 1 !important;}
        .cm-phpdoc-tag {color: #FFD700 !important; font-weight: bold !important; text-shadow: 0 0 2px rgba(255, 215, 0, 0.3);}
    `);

  let SNIPPETS = {}; // Variable global

  function cargarSnippetsDesdeGithub() {
    const url =
      "https://raw.githubusercontent.com/derazo75/sc_editor_plugins/main/snippets.json";
    GM_xmlhttpRequest({
      method: "GET",
      url: url,
      onload: function (response) {
        if (response.status === 200) {
          try {
            SNIPPETS = JSON.parse(response.responseText);
            console.log("✅ Snippets sincronizados.");
          } catch (e) {
            console.error("Error JSON", e);
          }
        }
      },
    });
  }

  function showSnippetHints(cm) {
    cm.showHint({
      hint: function () {
        const cursor = cm.getCursor();
        const token = cm.getTokenAt(cursor);
        const start = token.start;
        const end = cursor.ch;
        const line = cursor.line;

        // Obtenemos la palabra que se está escribiendo actualmente
        const currentWord = token.string.toLowerCase();

        // Filtramos los snippets dinámicamente según lo que escribes
        const filteredKeys = Object.keys(SNIPPETS).filter(
          (key) =>
            key.toLowerCase().includes(currentWord) || currentWord === "",
        );

        const listaHints = filteredKeys.map((key) => {
          const fullText = SNIPPETS[key].replace("$0", "");
          const previewText = fullText.replace(/\s+/g, " ").substring(0, 80);
          const hasMore = fullText.length > 80;

          return {
            text: fullText,
            displayText: key,
            render: (el, self, data) => {
              const container = document.createElement("div");
              container.style.whiteSpace = "nowrap";
              container.style.display = "flex";
              container.style.alignItems = "center";

              const titleSpan = document.createElement("span");
              titleSpan.style.fontWeight = "bold";
              titleSpan.style.color = "#000";
              titleSpan.textContent = `📝 ${data.displayText}:`;

              const previewSpan = document.createElement("span");
              previewSpan.style.color = "#666";
              previewSpan.style.fontStyle = "italic";
              previewSpan.style.marginLeft = "8px";
              previewSpan.textContent = previewText + (hasMore ? "..." : "");

              container.appendChild(titleSpan);
              container.appendChild(previewSpan);
              el.appendChild(container);
            },
          };
        });

        return {
          list: listaHints,
          from: CodeMirror.Pos(line, start),
          to: CodeMirror.Pos(line, end),
        };
      },
      completeSingle: false,
      alignWithWord: true,
      closeOnUnfocus: true,
    });
  }
  function guardarHistorialSC(editor) {
    try {
      const history = editor.getHistory();
      // Usamos una llave única para el editor de Scriptcase actual
      const storageKey = "sc_hist_" + window.location.pathname;
      sessionStorage.setItem(storageKey, JSON.stringify(history));
    } catch (e) {
      console.warn("No se pudo guardar el historial:", e);
    }
  }

  function restaurarHistorialSC(editor) {
    try {
      const storageKey = "sc_hist_" + window.location.pathname;
      const savedHistory = sessionStorage.getItem(storageKey);
      if (savedHistory) {
        editor.setHistory(JSON.parse(savedHistory));
        console.log("🔄 Historial de Control+Z recuperado.");
      }
    } catch (e) {
      console.warn("No se pudo restaurar el historial:", e);
    }
  }

  function formatCode(cm) {
    // 1. Re-indentar todo el documento
    const lastLine = cm.lineCount();
    cm.operation(() => {
      for (let i = 0; i < lastLine; i++) {
        cm.indentLine(i, "smart");
      }
    });
  }

  // --- ACTIVACIÓN ---
  function aplicarConfiguracion() {
    if (typeof editor !== "undefined" && editor.setOption) {
      CodeMirror.defineMode("php-heredoc", function (config) {
        return CodeMirror.multiplexingMode(
          // Modo Base (PHP que ya conoce Scriptcase)
          CodeMirror.getMode(config, { name: "php", startOpen: true }),
          {
            open: "<<<HTML",
            close: "HTML;",
            mode: CodeMirror.getMode(config, "text/html"),
            delimStyle: "keyword", // Colorea el <<<HTML como una palabra reservada
          },
        );
      });
      editor.setOption("mode", "php-heredoc");

      const tagOverlay = {
        token: function (stream) {
          // Busca específicamente palabras que empiecen con @
          if (
            stream.match(
              /^@(param|return|var|author|since|throws|category|package|copyright|license|version|link|deprecated|see)/,
            )
          ) {
            return "phpdoc-tag"; // Usamos nuestra clase personalizada
          }
          // Avanza hasta encontrar el siguiente @ o el final de la línea
          while (
            stream.next() != null &&
            !stream.match(
              /^@(param|return|var|author|since|throws|category|package|copyright|license|version|link|deprecated|see)/,
              false,
            )
          ) {}
          return null;
        },
      };

      editor.addOverlay(tagOverlay);

      editor.setOption("continueComments", true);

      editor.setOption("autoCloseBrackets", true);
      editor.setOption("matchBrackets", true);
      editor.setOption("highlightSelectionMatches", {
        showToken: /\w/,
        annotateScrollbar: true,
      });
      editor.setOption("autoCloseTags", true);
      editor.setOption("matchTags", { bothTags: true });
      editor.setOption("tabSize", 4); // El ancho visual del tabulador
      editor.setOption("indentUnit", 4); // Cuántos espacios insertar al tabular
      editor.setOption("indentWithTabs", false);

      editor.addKeyMap({
        "Shift-Alt-G": function (cm) {
          formatCode(cm);
        },
        Enter: "newlineAndIndentContinueComment",
        "Ctrl-Alt-Space": function (cm) {
          showSnippetHints(cm);
        },
      });

      setTimeout(() => {
        editor.refresh();
      }, 250);
      console.log("🎨 UX Boost V2: Plugins adicionales activados.");
    }
  }

  // Intentamos activar cada segundo hasta encontrar el editor
  let checkCount = 0;
  const interval = setInterval(() => {
    if (typeof editor !== "undefined") {
      aplicarConfiguracion();
      clearInterval(interval);
    }
    if (checkCount++ > 15) clearInterval(interval); // Timeout tras 15 seg
  }, 1000);

  // --- LÓGICA DE HISTORIAL ---
  // 1. Restaurar historial guardado al iniciar
  const storageKey = "sc_hist_" + window.location.pathname;
  const savedHistory = sessionStorage.getItem(storageKey);
  if (savedHistory) {
    try {
      editor.setHistory(JSON.parse(savedHistory));
      console.log("🔄 Historial recuperado.");
    } catch (e) {
      console.warn("Error restaurando historial", e);
    }
  }

  // 2. Guardar historial automáticamente en cada cambio
  editor.on("change", () => {
    clearTimeout(window.saveHistTimeout);
    window.saveHistTimeout = setTimeout(() => {
      sessionStorage.setItem(storageKey, JSON.stringify(editor.getHistory()));
    }, 1000);
  });

  cargarSnippetsDesdeGithub();
  // 3. Guardado extra preventivo con Ctrl+S
  window.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      sessionStorage.setItem(storageKey, JSON.stringify(editor.getHistory()));
    }
  });
  // ---------------------------
})();
