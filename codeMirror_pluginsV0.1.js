// ==UserScript==
// @name         Scriptcase - CodeMirror 5 Plugins
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Cierre de llaves, resaltado de línea y brackets para Scriptcase
// @author       Fernando erazo
// @match        *://localhost:9000/*
// @match        *://*/scriptcase/devel/*

// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/closebrackets.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/matchbrackets.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/search/match-highlighter.min.js
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

  let SNIPPETS = {};

  // 1. Configuración de Estilos
  function inyectarEstilos() {
    GM_addStyle(`
            .CodeMirror-activeline-background { background: rgba(0, 150, 255, 0.08) !important; }
            .CodeMirror-matchingbracket { color: #FF0000 !important; font-weight: bold !important; text-decoration: underline !important; border-bottom: 1px solid red; }
            .CodeMirror-matchingtag { background: rgba(255, 150, 0, 0.3) !important; border-bottom: 1px solid orange; border-top: 1px solid orange; }
            .cm-matchhighlight { background-color: rgba(255, 255, 0, 0.3) !important; }
            .cm-comment { color: #00FFFF !important; font-style: italic; opacity: 1 !important; }
            .cm-phpdoc-tag { color: #FFD700 !important; font-weight: bold !important; text-shadow: 0 0 2px rgba(255, 215, 0, 0.3); }
        `);
  }

  // 2. Gestión de Datos (GitHub)
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

  // 3. Utilidades de Identificación y Formateo
  function getSCStorageKey(prefix = "sc_hist") {
    const params = new URLSearchParams(window.location.search);
    const apl = params.get("nmgp_apl_orig") || params.get("apl_nome") || "apl";
    const event = params.get("nmgp_art") || params.get("nmgp_pos") || "index";
    const content = typeof editor !== "undefined" ? editor.getValue() : "";

    let hash = 0;
    const sample = content.substring(0, 100);
    for (let i = 0; i < sample.length; i++) {
      hash = (hash << 5) - hash + sample.charCodeAt(i);
      hash |= 0;
    }
    return `${prefix}_${apl}_${event}_${Math.abs(hash)}`;
  }

  /*  function formatCode(cm) {
    const lastLine = cm.lineCount();
    cm.operation(() => {
      for (let i = 0; i < lastLine; i++) {
        cm.indentLine(i, "smart");
      }
    });
  }
  */
  function formatCode(cm) {
    cm.operation(() => {
      let value = cm.getValue();

      // 1. NORMALIZAR ESTRUCTURAS (Subir llaves y asegurar espacios)
      // Sube llaves de if, else, for, foreach, while, switch que estén en la línea siguiente
      value = value.replace(
        /\b(if|else|for|foreach|while|switch|try|catch|finally)\b\s*\((.*?)\)\s*\n\s*\{/g,
        "$1 ($2) {",
      );

      // Caso especial para 'else {' (que no lleva paréntesis)
      value = value.replace(/\belse\b\s*\n\s*\{/g, "else {");

      // Asegurar UN espacio antes de la llave si quedó pegada: if(){ -> if() {
      value = value.replace(/\)\s*\{/g, ") {");
      value = value.replace(/\belse\s*\{/g, "else {");

      // 2. FORZAR ETIQUETAS PHP AL INICIO DE LÍNEA
      value = value.replace(/^[ \t]+(<\?php|<\?)/gm, "$1");

      // 3. ALINEACIÓN DE SIGNOS IGUAL (=) EN BLOQUES
      const lines = value.split("\n");
      let i = 0;
      while (i < lines.length) {
        if (
          lines[i].includes("=") &&
          !/^\s*(if|for|while|foreach|switch|return)/i.test(lines[i])
        ) {
          let start = i;
          let maxPos = 0;
          let block = [];

          while (
            i < lines.length &&
            lines[i].includes("=") &&
            !/^\s*(if|for|while|foreach|switch|return)/i.test(lines[i])
          ) {
            let parts = lines[i].split("=");
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
      value = lines.join("\n");
      cm.setValue(value);

      // 4. INDENTACIÓN INTELIGENTE FINAL
      const lastLine = cm.lineCount();
      for (let j = 0; j < lastLine; j++) {
        const lineText = cm.getLine(j).trim();
        if (lineText.startsWith("<?php") || lineText.startsWith("<?")) {
          cm.indentLine(j, 0);
        } else {
          cm.indentLine(j, "smart");
        }
      }
    });
    console.log(
      "🛠️ Formato Pro: Llaves subidas, espacios corregidos y asignaciones alineadas.",
    );
  }

  function showSnippetHints(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);

    const isInvalidToken = /[^a-zA-Z0-9_]/.test(token.string);
    const currentWord = isInvalidToken ? "" : token.string.toLowerCase();

    const filteredKeys = Object.keys(SNIPPETS).filter(
      (key) => key.toLowerCase().includes(currentWord) || currentWord === "",
    );

    if (filteredKeys.length === 0) return;

    cm.showHint({
      hint: function () {
        const listaHints = filteredKeys.map((key) => {
          // IMPORTANTE: No quitamos el $0 aquí para poder rastrearlo luego
          const rawText = SNIPPETS[key];
          const previewText = rawText
            .replace("$0", "")
            .replace(/\s+/g, " ")
            .substring(0, 60);

          return {
            text: rawText, // Insertamos el texto original con la marca
            displayText: key,
            render: (el, self, data) => {
              const container = document.createElement("div");
              container.style =
                "display: flex; justify-content: space-between; width: 100%; min-width: 300px;";
              container.innerHTML = `<span><strong>📝 ${data.displayText}</strong></span>
                                               <span style="color:#888; font-size: 0.9em; margin-left: 15px;">${previewText}...</span>`;
              el.appendChild(container);
            },
          };
        });

        return {
          list: listaHints,
          from: isInvalidToken
            ? cursor
            : CodeMirror.Pos(cursor.line, token.start),
          to: cursor,
        };
      },
      completeSingle: false,
      alignWithWord: true,
      closeOnUnfocus: true,
    });

    // --- EL MOTOR DE TELETRANSPORTE ---
    // Escuchamos el evento 'pick' que se dispara al elegir un snippet
    CodeMirror.on(cm, "endCompletion", function () {
      // Buscamos el $0 en todo el documento (o podrías limitar el rango por rendimiento)
      const content = cm.getValue();
      const marker = "$0";
      const index = content.indexOf(marker);

      if (index !== -1) {
        const pos = cm.posFromIndex(index);

        // 1. Borramos el marcador $0
        cm.replaceRange("", pos, cm.posFromIndex(index + marker.length));

        // 2. Ponemos el cursor en esa posición exacta
        cm.setCursor(pos);

        // 3. Opcional: Refrescar para asegurar que el foco se vea
        cm.focus();
      }
    });
  }

  // 5. Gestión del Historial (Undo/Redo)
  function gestionarHistorial(cm) {
    const storageKey = getSCStorageKey();

    // Restaurar
    const savedHistory = sessionStorage.getItem(storageKey);
    if (savedHistory) {
      try {
        cm.setHistory(JSON.parse(savedHistory));
        console.log("🔄 Historial recuperado.");
      } catch (e) {
        console.warn("Error restaurando historial", e);
      }
    }

    // Guardar en cambios
    cm.on("change", () => {
      clearTimeout(window.saveHistTimeout);
      window.saveHistTimeout = setTimeout(() => {
        sessionStorage.setItem(storageKey, JSON.stringify(cm.getHistory()));
      }, 1000);
    });

    // Guardado preventivo Ctrl+S
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        sessionStorage.setItem(storageKey, JSON.stringify(cm.getHistory()));
      }
    });
  }

  // 6. Aplicación de Configuración al Editor
  function aplicarConfiguracion() {
    if (typeof editor === "undefined" || !editor.setOption) return;

    // Definición de Modos Especiales

    CodeMirror.defineMode("php-heredoc", function (config) {
      return CodeMirror.multiplexingMode(
        CodeMirror.getMode(config, { name: "php", startOpen: true }),
        {
          open: "<<<HTML",
          close: "HTML;",
          mode: CodeMirror.getMode(config, "text/html"),
          delimStyle: "keyword",
        },
      );
    });

    const tagOverlay = {
      token: function (stream) {
        if (
          stream.match(
            /^@(param|return|var|author|since|throws|category|package|copyright|license|version|link|deprecated|see)/,
          )
        ) {
          return "phpdoc-tag";
        }
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

    // Set Options
    //editor.setOption("mode", "php-heredoc");
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

    // Keymaps
    editor.addKeyMap({
      "Shift-Alt-G": (cm) => formatCode(cm),
      Enter: "newlineAndIndentContinueComment",
      "Ctrl-Alt-Space": (cm) => showSnippetHints(cm),
    });

    // Inicializar Historial
    gestionarHistorial(editor);

    setTimeout(() => editor.refresh(), 250);
    console.log("🎨 UX Boost V2: Plugins activados.");
  }

  // --- EJECUCIÓN ---
  inyectarEstilos();
  cargarSnippetsDesdeGithub();

  let checkCount = 0;
  const interval = setInterval(() => {
    if (typeof editor !== "undefined") {
      aplicarConfiguracion();
      clearInterval(interval);
    }
    if (checkCount++ > 15) clearInterval(interval);
  }, 1000);
})();
