// ==UserScript==
// @name         Scriptcase CodeMirror - Suite Full (Linter, IA, Plugins & Historial)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Combinación completa de herramientas de análisis, IA y personalización de UX para Scriptcase
// @author       Fernando Erazo
// @match        *://localhost/*
// @match        *://127.0.0.1/*
// @match        *://*/scriptcase/devel/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-end

// --- DEPENDENCIAS CODEMIRROR ---
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/closebrackets.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/matchbrackets.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/search/match-highlighter.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/matchtags.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/mode/multiplex.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/comment/continuecomment.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/comment/comment.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/hint/show-hint.min.js
// ==/UserScript==

(function () {
  "use strict";

  let SNIPPETS = {};
  const panelLint = document.createElement("div");

  // 1. CONFIGURACIÓN DE ESTILOS (UI)
  function inyectarEstilos() {
    panelLint.id = "sc-linter-panel";
    panelLint.onclick = () => {
      panelLint.style.display = "none";
    };
    panelLint.style = `position: fixed; top: 0px; right: 200px; padding: 15px; z-index: 10000; font-family: 'Consolas', monospace; font-size: 13px; max-width: 450px; display: none; box-shadow: 0 8px 24px rgba(0,0,0,0.5); border-left: 5px solid #ff4444; line-height: 1.4; word-wrap: break-word; white-space: pre-wrap;`;
    document.body.appendChild(panelLint);

    GM_addStyle(`
            .CodeMirror-activeline-background { background: rgba(0, 150, 255, 0.08) !important; }
            .CodeMirror-matchingbracket { color: #FF0000 !important; font-weight: bold !important; text-decoration: underline !important; border-bottom: 1px solid red; }
            .CodeMirror-matchingtag { background: rgba(255, 150, 0, 0.3) !important; border-bottom: 1px solid orange; border-top: 1px solid orange; }
            .cm-matchhighlight { background-color: rgba(255, 255, 0, 0.3) !important; }
            .cm-comment { color: #00FFFF !important; font-style: italic; opacity: 1 !important; }
            .cm-phpdoc-tag { color: #FFD700 !important; font-weight: bold !important; text-shadow: 0 0 2px rgba(255, 215, 0, 0.3); }
            .cm-sql-word { color: #70ffaa !important; font-weight: bold !important; }
            .cm-sql-operator { color: #50fa7b !important; font-weight: bold !important; }
    `);
  }

  // 2. GESTIÓN DE SNIPPETS (GitHub)
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
            console.error("Error JSON Snippets", e);
          }
        }
      },
    });
  }

  // 3. UTILIDADES DE IDENTIFICACIÓN
  function getSCStorageKey(cm) {
    const params = new URLSearchParams(window.location.search);
    const apl = params.get("nmgp_apl_orig") || params.get("apl_nome") || "apl";
    const event = params.get("nmgp_art") || params.get("nmgp_pos") || "index";
    const content = cm.getValue().substring(0, 100);

    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash |= 0;
    }
    console.log(`sc_hist_${apl}_${event}_${Math.abs(hash)}`);
    return `sc_hist_${apl}_${event}_${Math.abs(hash)}`;
  }

  // 4. FUNCIONES DE FORMATEO Y ANÁLISIS

  // Formateador Local (Alt+Shift+G)
  function formatCodeLocal(cm) {
    cm.operation(() => {
      const cursor = cm.getCursor();
      const scrollInfo = cm.getScrollInfo();
      let value = cm.getValue();

      // 1. Normalizar estructuras básicas
      value = value.replace(
        /\b(if|else|for|foreach|while|switch|try|catch|finally)\b\s*\((.*?)\)\s*\n\s*\{/g,
        "$1 ($2) {",
      );
      value = value.replace(/\belse\b\s*\n\s*\{/g, "else {");
      value = value.replace(/\)\s*\{/g, ") {");
      value = value.replace(/^[ \t]+(<\?php|<\?)/gm, "$1");

      const lines = value.split("\n");
      let i = 0;
      while (i < lines.length) {
        // CORRECCIÓN: Detectar '=' pero ignorar '=>' (asociación de arrays)
        const hasAssignment =
          lines[i].includes("=") &&
          !lines[i].includes("=>") &&
          !/^\s*(if|for|while|foreach|switch|return)/i.test(lines[i]);

        const firstEqualPos = lines[i].indexOf("=");
        const textBeforeEqual = lines[i].substring(0, firstEqualPos);
        const isInsideString =
          (textBeforeEqual.match(/"/g) || []).length % 2 !== 0 ||
          (textBeforeEqual.match(/'/g) || []).length % 2 !== 0;

        if (hasAssignment && !isInsideString) {
          let start = i,
            maxPos = 0,
            block = [];

          while (i < lines.length) {
            const currentLine = lines[i];
            const eqPos = currentLine.indexOf("=");

            // Romper bloque si no hay '=' o si es un '=>' o estructura de control
            if (
              eqPos === -1 ||
              currentLine.includes("=>") ||
              /^\s*(if|for|while|foreach|switch|return)/i.test(currentLine)
            )
              break;

            const preEq = currentLine.substring(0, eqPos);
            const inString =
              (preEq.match(/"/g) || []).length % 2 !== 0 ||
              (preEq.match(/'/g) || []).length % 2 !== 0;

            if (inString) break;

            let parts = currentLine.split("=");
            let leftSide = parts[0].trimEnd();
            maxPos = Math.max(maxPos, leftSide.trim().length);
            block.push({
              left: leftSide.trim(),
              right: parts.slice(1).join("=").trim(),
            });
            i++;
          }

          if (block.length > 1) {
            for (let j = 0; j < block.length; j++) {
              lines[start + j] =
                block[j].left.padEnd(maxPos) + " = " + block[j].right;
            }
          }
        } else {
          i++;
        }
      }

      cm.setValue(lines.join("\n"));

      for (let j = 0; j < cm.lineCount(); j++) {
        const lineText = cm.getLine(j).trim();
        cm.indentLine(
          j,
          lineText.startsWith("<?php") || lineText.startsWith("<?")
            ? 0
            : "smart",
        );
      }

      cm.setCursor(cursor);
      cm.scrollTo(scrollInfo.left, scrollInfo.top);
    });
    console.log("🛠️ Formato Local: Alineación corregida (protegiendo '=>').");
  } // Formateador de Servidor (Alt+Shift+F)
  function ejecutarFormateadorServer(cm) {
    const cursorAntes = cm.getCursor();
    const todoElCodigo = cm.getValue();

    fetch("http://localhost:5000/format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: todoElCodigo }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (
          data.status === "success" &&
          todoElCodigo.length !== data.code.length
        ) {
          cm.operation(() => {
            cm.replaceRange(
              data.code,
              { line: 0, ch: 0 },
              { line: cm.lineCount() },
            );
            setTimeout(() => {
              cm.refresh();
              cm.setCursor(cursorAntes);
              cm.focus();
            }, 50);
          });
        } else {
          mostrarMensajeInfo(
            "Código ya formateado o no se formateó por error de sintaxis",
          );
        }
      })
      .catch((err) => console.error("Error Formateo:", err));
  }

  function ejecutarLinter(cm) {
    const codigoActual = cm.getValue();
    panelLint.style.display = "block";
    panelLint.style.backgroundColor = "#333";
    panelLint.innerHTML = "⏳ Verificando...";

    fetch("http://localhost:5000/lint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: codigoActual }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "error") {
          panelLint.style.backgroundColor = "#2d2d2d";
          panelLint.style.color = "#ff6b6b";
          panelLint.style.borderLeft = "5px solid #ff4444";
          let mensaje = data.message;
          if (data.line) {
            mensaje = mensaje.replace(
              `en la línea ${data.line}`,
              `<b style="color: #ffee00;">en la línea ${data.line}</b>`,
            );
            cm.setCursor({ line: data.line - 1, ch: 0 });
            cm.focus();
          }
          panelLint.innerHTML = `<div>⚠️ Error de Sintaxis</div><div>${mensaje}</div>`;
        } else {
          panelLint.style.backgroundColor = "#1e4620";
          panelLint.style.color = "#a3cfbb";
          panelLint.style.borderLeft = "5px solid #28a745";
          panelLint.innerHTML = `<strong>✅ ${data.message}</strong>`;
          setTimeout(() => {
            panelLint.style.display = "none";
          }, 3000);
        }
      })
      .catch(() => {
        panelLint.style.backgroundColor = "#f0ad4e";
        panelLint.innerHTML = "❌ Servidor Linter no disponible";
      });
  }

  function ejecutarIA(cm, lineText, cursor) {
    const instruccion = lineText.trim();
    if (instruccion.length > 3) {
      panelLint.style.display = "block";
      panelLint.style.backgroundColor = "#333";
      panelLint.style.color = "#00d4ff";
      panelLint.style.borderLeft = "5px solid #00d4ff";
      panelLint.innerHTML = "⏳ <strong>IA:</strong> Consultando...";

      fetch("http://localhost:5001/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: instruccion, context: cm.getValue() }),
      })
        .then((res) => res.json())
        .then((data) => {
          const currentLine = cm.getLine(cursor.line);
          cm.operation(() => {
            cm.replaceRange(
              data.code,
              { line: cursor.line, ch: 0 },
              { line: cursor.line, ch: currentLine.length },
            );
          });
          panelLint.style.display = "none";
        })
        .catch((err) => {
          panelLint.style.backgroundColor = "#2d2d2d";
          panelLint.style.color = "#ff6b6b";
          panelLint.style.borderLeft = "5px solid #ff4444";
          panelLint.innerHTML = `❌ <strong>Error IA:</strong> ${err.message}`;
        });
    }
  }

  function consultarServidor(cm, tipo) {
    const cursor = cm.getCursor();
    const lineText = cm.getLine(cursor.line).substring(0, cursor.ch);

    fetch("http://localhost:5000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: cm.getValue(),
        line_text: lineText,
        type: tipo,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        let funciones = data.suggestions || [];
        funciones.sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase()),
        );
        if (funciones.length > 0) abrirMenuFunciones(cm, funciones);
      })
      .catch(() => console.error("❌ Servidor de análisis no disponible."));
  }

  function abrirMenuFunciones(cm, lista) {
    const posInicial = cm.getCursor();
    cm.showHint({
      completeSingle: false,
      closeOnUnfocus: true,
      hint: function (cmInstance) {
        const cur = cmInstance.getCursor();
        const linea = cmInstance.getLine(cur.line);
        const filtro = linea.substring(posInicial.ch, cur.ch) || "";
        const filtrados = lista.filter((f) =>
          f.toLowerCase().startsWith(filtro.toLowerCase()),
        );
        if (filtrados.length === 0) return null;
        return { list: filtrados, from: posInicial, to: cur };
      },
    });
  }

  function showSnippetHints(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    const posInicial = { line: cursor.line, ch: token.start };

    // Si el token actual es un símbolo o espacio, ajustamos la posición inicial al cursor
    const isInvalidToken = /[^a-zA-Z0-9_]/.test(token.string);
    const startPos = isInvalidToken ? cursor : posInicial;

    cm.showHint({
      completeSingle: false,
      closeOnUnfocus: true,
      hint: function (cmInstance) {
        const cur = cmInstance.getCursor();
        const tokenActual = cmInstance.getTokenAt(cur);

        // El texto que el usuario está escribiendo para filtrar
        // Si el usuario escribió algo, usamos el string del token; si no, vacío.
        const currentWord = !/[^a-zA-Z0-9_]/.test(tokenActual.string)
          ? tokenActual.string.toLowerCase()
          : "";

        const keys = Object.keys(SNIPPETS).filter((key) =>
          key.toLowerCase().startsWith(currentWord),
        );

        if (keys.length === 0) return null;

        return {
          list: keys.map((key) => ({
            text: SNIPPETS[key],
            displayText: key,
            render: (el, self, data) => {
              const container = document.createElement("div");
              container.style =
                "display: flex; justify-content: space-between; width: 100%; min-width: 250px;";
              const preview = SNIPPETS[key]
                .replace("$0", "")
                .replace(/\s+/g, " ")
                .substring(0, 40);
              container.innerHTML = `<span><strong>📝 ${data.displayText}</strong></span>
                                     <span style="color:#888; font-size: 0.85em; margin-left: 15px;">${preview}...</span>`;
              el.appendChild(container);
            },
          })),
          from: startPos,
          to: cur,
        };
      },
    });

    // Manejo del marcador de posición $0 tras insertar el snippet
    CodeMirror.on(cm, "endCompletion", function () {
      const content = cm.getValue();
      const marker = "$0";
      const index = content.indexOf(marker);
      if (index !== -1) {
        const pos = cm.posFromIndex(index);
        cm.replaceRange("", pos, cm.posFromIndex(index + marker.length));
        cm.setCursor(pos);
        cm.focus();
      }
    });
  }

  function gestionarHistorial(cm) {
    const storageKey = getSCStorageKey(cm);
    const savedHistory = sessionStorage.getItem(storageKey);
    if (savedHistory) {
      try {
        cm.setHistory(JSON.parse(savedHistory));
        console.log("🔄 Historial recuperado.");
      } catch (e) {
        console.warn("Error restaurando historial", e);
      }
    }

    cm.on("change", () => {
      clearTimeout(window.saveHistTimeout);
      window.saveHistTimeout = setTimeout(() => {
        sessionStorage.setItem(storageKey, JSON.stringify(cm.getHistory()));
      }, 1000);
    });

    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        sessionStorage.setItem(storageKey, JSON.stringify(cm.getHistory()));
      }
    });
  }

  function mostrarMensajeInfo(msg) {
    panelLint.style.display = "block";
    panelLint.style.backgroundColor = "#333";
    panelLint.style.color = "white";
    panelLint.style.borderLeft = "5px solid #ffff44";
    panelLint.innerHTML = `<strong>ℹ️ Info:</strong> ${msg}`;
    setTimeout(() => {
      panelLint.style.display = "none";
    }, 3000);
  }

  // 5. APLICAR CONFIGURACIÓN AL EDITOR
  function aplicarConfiguracion(editor) {
    if (!editor || !editor.setOption) return;

    // Overlay para SQL
    // 1. Palabras clave: Mantienen el ^ y el \b
    const sqlKeywords =
      /^(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|AND|OR|ORDER|BY|GROUP|LIMIT|JOIN|LEFT|RIGHT|INNER|ON|SET|VALUES|IN|IS|NOT|NULL|INTO|UNION|ALL|AS|DISTINCT|HAVING)\b/i;

    // 2. Operadores: Quitamos el \b al final y usamos una lista clara
    // El orden importa: los más largos (>=) van antes que los cortos (>)
    const sqlOperators = /^(=|<=|>=|<>|!=|<|>|LIKE|BETWEEN)/i;

    const sqlInStringOverlay = {
      token: function (stream) {
        // Validación de estructura SQL en la línea
        const hasSqlStructure = /\b(SELECT|FROM|UPDATE|INSERT|DELETE)\b/i.test(
          stream.string,
        );

        if (hasSqlStructure) {
          // CASO A: Palabras clave (Requieren ser inicio de palabra)
          const charAntes = stream.string[stream.pos - 1] || " ";
          const esInicioPalabra = /\W/.test(charAntes);

          if (esInicioPalabra && stream.match(sqlKeywords)) {
            return "sql-word";
          }

          // CASO B: Operadores (No requieren inicio de palabra necesariamente,
          // pero el match con ^ asegura que se detecten donde está el cursor)
          if (stream.match(sqlOperators)) {
            return "sql-operator";
          }
        }

        stream.next();
        return null;
      },
    };

    editor.addOverlay(sqlInStringOverlay);

    // Overlay para PHPDoc
    const tagOverlay = {
      token: function (stream) {
        if (
          stream.match(
            /^@(param|return|var|author|since|throws|category|package|copyright|license|version|link|deprecated|see)/,
          )
        )
          return "phpdoc-tag";
        while (
          stream.next() != null &&
          !stream.match(
            /^@(?=param|return|var|author|since|throws|category|package|copyright|license|version|link|deprecated|see)/,
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
    editor.setOption("matchTags", { bothTags: true });
    editor.setOption("highlightSelectionMatches", {
      showToken: /\w/,
      annotateScrollbar: true,
    });
    editor.setOption("tabSize", 4);
    editor.setOption("indentUnit", 4);
    editor.setOption("indentWithTabs", false);

    // Keymaps Unificados
    editor.addKeyMap({
      "Shift-Alt-G": (cm) => formatCodeLocal(cm),
      /*
      "Shift-Alt-F": (cm) => ejecutarFormateadorServer(cm),
      "Shift-Alt-A": (cm) => consultarServidor(cm, "global"),
      "Shift-Alt-S": (cm) => ejecutarLinter(cm),
      "Shift-Alt-K": (cm) => {
        const cursor = cm.getCursor();
        const lineText = cm.getLine(cursor.line).substring(0, cursor.ch);
        ejecutarIA(cm, lineText, cursor);
      },
      */
      "Ctrl-Alt-Space": (cm) => showSnippetHints(cm),
      Enter: "newlineAndIndentContinueComment",
    });

    // Handlers de input para autocompletado automático
    /*
    editor.on("inputRead", (cm, change) => {
      const cursor = cm.getCursor();
      const lineText = cm.getLine(cursor.line).substring(0, cursor.ch);
      if (
        change.text[0] === ">" ||
        (change.text[0] === ":" && lineText.endsWith("::"))
      ) {
        consultarServidor(cm, "auto");
      }
    });
    */
    gestionarHistorial(editor);
    setTimeout(() => editor.refresh(), 250);
    console.log("🎨 UX Boost V2 & Analysis Tools: Cargados correctamente.");
  }

  // --- EJECUCIÓN ---
  inyectarEstilos();
  cargarSnippetsDesdeGithub();

  let checkCount = 0;
  const interval = setInterval(() => {
    // Intentamos obtener el editor de Scriptcase
    const el = document.querySelector(".CodeMirror");
    if (el && el.CodeMirror) {
      aplicarConfiguracion(el.CodeMirror);
      clearInterval(interval);
    }
    if (checkCount++ > 20) clearInterval(interval);
  }, 1000);
})();
