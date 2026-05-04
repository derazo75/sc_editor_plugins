// ==UserScript==
// @name         Scriptcase CodeMirror - Suite Full (Linter, IA, Plugins & Historial)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Combinación completa de herramientas de análisis, IA y personalización de UX para Scriptcase
// @author       Fernando Erazo
// @match        *://*/scriptcase/devel/iface/event.php*
// @match        *://*/scriptcase/devel/compat/nm_edit_php_edit.php*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-end

// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/closebrackets.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/matchbrackets.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/search/match-highlighter.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/edit/matchtags.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/mode/multiplex.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/comment/continuecomment.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/addon/comment/comment.min.js

// @require      https://cdn.jsdelivr.net/npm/prettier@2.8.8/standalone.js
// @require      https://cdn.jsdelivr.net/npm/@prettier/plugin-php@0.19.6/standalone.js
// @require      https://cdn.jsdelivr.net/npm/prettier@2.8.8/parser-html.js

// ==/UserScript==

(function () {
  "use strict";

  // Variables de configuración (puedes moverlas al inicio de tu script)
  const CONFIG_GROQ = {
    apiKey: "tu_api_key", // Cambia esto por tu clave real
    model: "openai/gpt-oss-120b",
    effort: "medium",
    effortSC: "high",
    systemPrompt:
      "Role: PHP 8.2/MySQL 8 Dev. Output: ONLY raw PHP code (no explanations/Markdown). Syntax: Fully Qualified Namespaces only (no 'use'). Context: $this->Db = ADODB. Rules: Use ONLY current stable APIs (no deprecated). PhpSpreadsheet: modern API only (no getCellByColumnAndRow). Default: no classes/functions unless specified.",
    systemPromptSC:
      "Role: Expert Scriptcase 9 (9.1+)/PHP 8.2/MySQL 8 Dev. Output: ONLY raw PHP code (no explanations/Markdown). Syntax: FQN only (no 'use'). Scriptcase: {field}, [global_var]. Macros: sc_select/sc_lookup with standard loops; NEVER assign macros to variables. Docs: https://www.scriptcase.net/docs/en_us/v9/manual/14-macros/02-macros/. Rules: Use ONLY stable APIs (no deprecated). PhpSpreadsheet: IOFactory/Spreadsheet/Writer (no getCellByColumnAndRow).",
  };

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
            .CodeMirror-activeline-background { background: rgba(0, 150, 255, 0.1) !important; }
            .CodeMirror-matchingbracket { color: #FF0000 !important; font-weight: bold !important; text-decoration: underline !important; border-bottom: 1px solid red; }
            .CodeMirror-matchingtag { background: rgba(255, 150, 0, 0.3) !important; border-bottom: 1px solid orange; border-top: 1px solid orange; }
            .cm-matchhighlight { background-color: rgba(255, 255, 0, 0.3) !important; }
            .cm-comment {color: #00FFFF !important; font-style: italic; backdrop-filter: brightness(0.3); mix-blend-mode: screen; }
            .cm-phpdoc-tag { font-style: normal !important; font-weight: bold !important;}
            .cm-sql-word { font-weight: bold !important; filter: brightness(1.1) contrast(1.1);}
            .cm-sql-operator { font-weight: bold !important; filter: brightness(1.1); contrast(1.1);}
            .cm-sc-macro { font-style: italic !important;  background: rgba(127, 127, 127, 0.1); }
            .cm-sc-global { font-style: italic !important;  background: rgba(127, 127, 127, 0.1); }
            .cm-sc-field { font-style: italic !important;  background: rgba(127, 127, 127, 0.1); }
            .cm-indent-guide {background: linear-gradient(to right, #555 1px, transparent 1px); background-size: 4ch 100%;}
            .linter-error-line { background: rgba(255, 0, 0, 0.25) !important; }
    `);
  }

  // .cm-sc-global {position: relative; font-weight: bold !important; border-radius: 0px; background: rgba(127, 127, 127, 0.1); text-decoration: underline !important; text-underline-offset: 2px;}
  // .cm-sc-field {position: relative; font-style: italic !important; border-radius: 0px; background: rgba(127, 127, 127, 0.1); text-decoration: underline !important; text-underline-offset: 2px;}

  // 2. GESTIÓN DE SNIPPETS (GitHub)
  function cargarSnippetsDesdeGithub() {
    const url = "https://raw.githubusercontent.com/derazo75/sc_editor_plugins/main/snippets.json";
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
  async function formatCodeLocal(cm) {
    // Detectamos si hay texto seleccionado
    const isSelection = cm.somethingSelected();
    const cursor = cm.getCursor();
    const scrollInfo = cm.getScrollInfo();

    // Obtenemos el código (la selección o todo el documento)
    const originalCode = isSelection ? cm.getSelection() : cm.getValue();

    if (!originalCode.trim() || typeof prettier === "undefined") return;

    let tempCode = originalCode;
    let almacenTemporal = {};
    let contador = 0;

    const guardarEnAlmacen = (contenido) => {
      const key = `SC_VAR_TEMP_${contador}_SC`;
      almacenTemporal[key] = contenido;
      contador++;
      return `$${key}`;
    };

    // --- PASO 1: EXTRACCIÓN (Protección de Scriptcase) ---

    // A. Macros sc_...
    let macroMatch;
    while ((macroMatch = /sc_[a-zA-Z0-9_]+\s*\(/.exec(tempCode)) !== null) {
      let inicio = macroMatch.index;
      let balance = 0;
      let fin = -1;
      let encontradoApertura = false;
      for (let i = inicio; i < tempCode.length; i++) {
        if (tempCode[i] === "(") {
          balance++;
          encontradoApertura = true;
        } else if (tempCode[i] === ")") {
          balance--;
          if (encontradoApertura && balance === 0) {
            fin = i;
            break;
          }
        }
      }
      if (fin !== -1) {
        const macroCompleta = tempCode.substring(inicio, fin + 1);
        tempCode = tempCode.substring(0, inicio) + guardarEnAlmacen(macroCompleta) + tempCode.substring(fin + 1);
      } else break;
    }

    // B. Campos {campo}
    tempCode = tempCode.replace(/(?<!\$)\{([^{}\s][^{}]*)\}/g, (match) => {
      return guardarEnAlmacen(match);
    });
    // C. Globales [global]
    tempCode = tempCode.replace(/(?<!\$)\[([a-zA-Z_][a-zA-Z0-9_]*)\]/g, (match) => {
      return guardarEnAlmacen(match);
    });

    // --- PASO 2: FORMATEO ---
    let addedTag = false;
    if (!tempCode.trim().startsWith("<?")) {
      tempCode = "<?php\n" + tempCode;
      addedTag = true;
    }

    try {
      const plugins = [window.prettierPlugins?.php, window.prettierPlugins?.html].filter(Boolean);

      let formatted = prettier.format(tempCode, {
        parser: "php",
        plugins: plugins,
        phpVersion: "8.2",
        tabWidth: 4,
        printWidth: 120,
        singleQuote: true,
        bracketSpacing: true,
        trailingCommaPHP: false,
        braceStyle: "1tbs",
        arrowParens: "avoid",
      });

      // --- PASO 3: RESTAURACIÓN ---
      if (addedTag) {
        // Quitamos la etiqueta inyectada
        formatted = formatted.replace(/^<\?php\s?(\r\n|\n)?/, "");
      }

      const keys = Object.keys(almacenTemporal).reverse();
      for (const key of keys) {
        formatted = formatted.split(`$${key}`).join(almacenTemporal[key]);
      }

      // --- PASO 4: APLICAR CAMBIOS ---
      if (formatted.trim() !== originalCode.trim()) {
        if (isSelection) {
          // Si había selección, reemplazamos solo ese trozo
          cm.replaceSelection(formatted, "format");
        } else {
          // Si no, reemplazamos todo el contenido
          cm.setValue(formatted, "format");
          cm.setCursor(cursor);
          cm.scrollTo(scrollInfo.left, scrollInfo.top);
        }
        console.log(isSelection ? "✨ Selección formateada" : "✨ Documento formateado");
      }
    } catch (err) {
      console.warn("Prettier Error:", err);

      let mensajeError = "Error de sintaxis: ";
      let rawMessage = err.message ? err.message.split("\n")[0] : "";

      // Si inyectamos <?php, corregimos el número de línea restando 1
      if (addedTag && rawMessage) {
        rawMessage = rawMessage.replace(/(line\s|:|\()(\d+)/g, (match, prefix, line) => {
          const actualLine = parseInt(line) - 1;
          return prefix + actualLine;
        });
      }

      mensajeError += rawMessage || "Revisa llaves o puntos y coma.";

      if (typeof mostrarMensajeInfo === "function") {
        mostrarMensajeInfo(mensajeError);
      }

      if (typeof ejecutarLinter === "function") {
        // ejecutarLinter(cm);
      }
    }
  }

  function ejecutarLinter(cm) {
    const codigoActual = cm.getValue();
    panelLint.style.display = "block";
    panelLint.style.backgroundColor = "#333";
    panelLint.innerHTML = "⏳ Verificando...";

    fetch("http://localhost:5005/lint", {
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
            mensaje = mensaje.replace(`en la línea ${data.line}`, `<b style="color: #ffee00;">en la línea ${data.line}</b>`);
            cm.setCursor({ line: data.line - 1, ch: 0 });
            cm.addLineClass(data.line - 1, "background", "linter-error-line");
            setTimeout(() => {
              cm.removeLineClass(data.line - 1, "background", "linter-error-line");
            }, 5000);
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

  /* global Groq */

  async function askAIJS(instruccion, contextoIA) {
    let currentSystemPrompt = CONFIG_GROQ.systemPrompt;
    let esfuerzoRazonamiento = CONFIG_GROQ.effort;
    let tarea = instruccion.trim();
    let isSC = false;

    if (tarea.startsWith("//SC")) {
      currentSystemPrompt = CONFIG_GROQ.systemPromptSC;
      esfuerzoRazonamiento = CONFIG_GROQ.effortSC;
      tarea = tarea.replace(/^\/\/SC/, "").trim();
      isSC = true;
    } else {
      tarea = tarea.replace(/^\/\//, "").trim();
    }

    const userContent = `CONTEXTO DEL CÓDIGO:\n${contextoIA}\n\nTAREA SOLICITADA:\n${tarea}`;

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CONFIG_GROQ.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CONFIG_GROQ.model,
          messages: [
            { role: "system", content: currentSystemPrompt },
            { role: "user", content: userContent },
          ],
          temperature: 0,
          // Si el modelo soporta razonamiento, se incluyen estos campos
          ...(CONFIG_GROQ.model.includes("oss") && { reasoning_effort: esfuerzoRazonamiento }),
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Error en la petición a Groq");
      }

      const data = await response.json();
      let respuesta = data.choices[0].message.content;

      // Limpieza de etiquetas y bloques de código
      let limpia = respuesta
        .replace(/^(\s*```[a-z]*\s*)/gi, "")
        .replace(/(\s*```\s*)$/g, "")
        .replace(/^\s*<\?php\s*/gi, "")
        .replace(/\s*\?>\s*$/g, "")
        .trim();

      return { code: limpia, status: "success" };
    } catch (err) {
      console.error("Error en Groq Fetch:", err);
      throw err;
    }
  }

  async function ejecutarIA(cm, lineText, cursor) {
    const seleccion = cm.getSelection();
    let instruccion = "";
    let contextoIA = "";

    // Mantenemos tu lógica de escenarios
    if (seleccion && seleccion.trim().length > 0) {
      // ESCENARIO 2: Selección (Línea 1 es instrucción, resto es contexto)
      const lineasSeleccionadas = seleccion.split("\n");
      instruccion = lineasSeleccionadas[0].trim();
      contextoIA = lineasSeleccionadas.slice(1).join("\n");
    } else {
      // ESCENARIO 1: Solo la línea actual
      instruccion = lineText.trim();
      contextoIA = "";
    }

    // Validación mínima para no disparar peticiones vacías
    if (instruccion.length > 3) {
      // Configuración visual del panel de carga
      panelLint.style.display = "block";
      panelLint.style.backgroundColor = "#333";
      panelLint.style.color = "#00d4ff";
      panelLint.innerHTML = "⏳ <strong>Groq IA:</strong> Generando código...";

      try {
        // Reemplazamos el fetch por el llamado directo a la función JS
        const data = await askAIJS(instruccion, contextoIA);

        // Formateamos la respuesta (Instrucción original + Código generado)
        const respuestaFinal = instruccion + "\n" + data.code;

        if (seleccion) {
          // Reemplaza el bloque seleccionado
          cm.replaceSelection(respuestaFinal);
        } else {
          // Reemplaza la línea actual
          const currentLine = cm.getLine(cursor.line);
          cm.replaceRange(respuestaFinal, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: currentLine.length });
        }

        // Ocultamos el panel al finalizar con éxito
        panelLint.style.display = "none";
      } catch (err) {
        // Manejo de errores del SDK o de red
        console.error("Error en ejecutarIA:", err);
        panelLint.style.color = "#ff4444";
        panelLint.innerHTML = `❌ <strong>Error:</strong> ${err.message}`;

        // Opcional: ocultar el error después de unos segundos
        setTimeout(() => {
          panelLint.style.display = "none";
        }, 5000);
      }
    }
  }

  function consultarServidor(cm, tipo) {
    const cursor = cm.getCursor();
    const lineText = cm.getLine(cursor.line).substring(0, cursor.ch);

    fetch("http://localhost:5005/analyze", {
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
        funciones.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
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
        const filtrados = lista.filter((f) => f.toLowerCase().startsWith(filtro.toLowerCase()));
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
        const currentWord = !/[^a-zA-Z0-9_]/.test(tokenActual.string) ? tokenActual.string.toLowerCase() : "";

        const keys = Object.keys(SNIPPETS).filter((key) => key.toLowerCase().startsWith(currentWord));

        if (keys.length === 0) return null;

        return {
          list: keys.map((key) => ({
            text: SNIPPETS[key],
            displayText: key,
            render: (el, self, data) => {
              const container = document.createElement("div");
              container.style = "display: flex; justify-content: space-between; width: 100%; min-width: 250px;";
              const preview = SNIPPETS[key].replace("$0", "").replace(/\s+/g, " ").substring(0, 40);
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

    cm.constructor.on(cm, "endCompletion", function () {
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

    // Limita el historial a 100 pasos para ahorrar memoria
    editor.setOption("historyEventDelay", 1000); // Agrupa cambios realizados en 1 segundo
    editor.setOption("undoDepth", 100); // Solo guarda los últimos 100 cambios
    // 1. Definiciones de Regex
    const sqlKeywords = /^(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|AND|OR|ORDER|BY|GROUP|LIMIT|JOIN|LEFT|RIGHT|INNER|ON|SET|VALUES|IN|IS|NOT|NULL|INTO|UNION|ALL|AS|DISTINCT|HAVING)\b/i;
    const sqlOperators = /^(=|<=|>=|<>|!=|<|>|LIKE|BETWEEN)/i;
    const scGlobals = /^\[[a-zA-Z_][a-zA-Z0-9_]*\]/;
    const scFields = /^\{[a-zA-Z_][a-zA-Z0-9_\[\]\s'"]*\}/;

    const scMacros = /^\bsc_[a-zA-Z0-9_]+\b/i;

    const masterOverlay = {
      token: function (stream) {
        // --- B. VARIABLES GLOBALES [v_global] ---
        if (stream.match(scGlobals)) return "sc-global";

        // --- C. CAMPOS DE TABLA / FORMULARIO ---
        if (stream.match(scFields)) return "sc-field";

        // --- C. MACROS SCRIPTCASE sc_function ---
        if (stream.match(scMacros)) return "sc-macro";

        // --- D. LÓGICA SQL (Solo dentro de strings con estructura SQL) ---
        const hasSqlStructure = /\b(SELECT|FROM|UPDATE|INSERT|DELETE)\b/i.test(stream.string);
        if (hasSqlStructure) {
          const charAntes = stream.string[stream.pos - 1] || " ";
          const esInicioPalabra = /\W/.test(charAntes);

          if (esInicioPalabra && stream.match(sqlKeywords)) return "sql-word";
          if (stream.match(sqlOperators)) return "sql-operator";
        }

        stream.next();
        return null;
      },
    };

    editor.addOverlay(masterOverlay);
    // Overlay para PHPDoc
    const tagOverlay = {
      token: function (stream) {
        if (stream.match(/^@(param|return|var|author|since|throws|category|package|copyright|license|version|link|deprecated|see)/)) return "phpdoc-tag";
        while (stream.next() != null && !stream.match(/^@(?=param|return|var|author|since|throws|category|package|copyright|license|version|link|deprecated|see)/, false)) {}
        return null;
      },
    };

    editor.addOverlay(tagOverlay);
    editor.addOverlay({
      token: function (stream) {
        // sol() detecta el inicio de la línea
        if (stream.sol()) {
          // eatSpace() consume los espacios/tabs iniciales
          if (stream.eatSpace()) {
            return "indent-guide"; // Aplica esta clase CSS a los espacios
          }
        }
        stream.skipToEnd();
        return null;
      },
    });

    // Activar las guías de indentación
    editor.setOption("showIndentGuides", true);
    editor.setOption("highlightIndentGuides", true);

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
      "Shift-Alt-F": (cm) => formatCodeLocal(cm),
      "Shift-Alt-A": (cm) => consultarServidor(cm, "global"),
      "Shift-Alt-S": (cm) => ejecutarLinter(cm),
      "Shift-Alt-K": (cm) => {
        const cursor = cm.getCursor();
        const lineText = cm.getLine(cursor.line).substring(0, cursor.ch);
        ejecutarIA(cm, lineText, cursor);
      },
      "Ctrl-Alt-Space": (cm) => showSnippetHints(cm),
      Enter: "newlineAndIndentContinueComment",
    });
    // Handlers de input para autocompletado automático
    editor.on("inputRead", (cm, change) => {
      const cursor = cm.getCursor();
      const lineText = cm.getLine(cursor.line).substring(0, cursor.ch);
      if (change.text[0] === ">" || (change.text[0] === ":" && lineText.endsWith("::"))) {
        consultarServidor(cm, "auto");
      }
    });

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
//fin
