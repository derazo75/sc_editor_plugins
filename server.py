import json
import os
import re
import subprocess
import tempfile

from flask import Flask, jsonify, request
from flask_cors import CORS
from groq import Groq

app = Flask(__name__)
# CORS configurado para permitir peticiones desde cualquier origen (Scriptcase)
CORS(app, resources={r"/*": {"origins": "*"}})


# ==========================================
# 1. CONFIGURACIÓN DE RUTAS
# ==========================================
def cargar_configuracion(archivo="config.json"):
    if not os.path.exists(archivo):
        print(f"Error: No se encuentra el archivo {archivo}")
        return None
    try:
        with open(archivo, "r") as f:
            config = json.load(f)
            return config
    except json.JSONDecodeError:
        print("Error: El archivo de configuración no tiene un formato JSON válido.")
        return None


# Uso de las variables
config = cargar_configuracion()

if config:
    DIR_TEMP = config.get("DIR_TEMP")
    PHP_PATH = config.get("PHP_PATH")
    PHP_FIXER_PATH = config.get("PHP_FIXER_PATH")
    RUTAS_LIBS = config.get("RUTAS_LIBS", [])  # Retorna lista vacía si no existe
    GROQ_API_KEY = config.get(
        "GROQ_API_KEY"
    )  # "openai/gpt-oss-120b",  "llama-3.3-70b-versatile",
    GROQ_MODEL = config.get("GROQ_MODEL")
    GROG_EFFORT = config.get("GROQ_EFFORT")
    GROG_EFFORT_SC = config.get("GROQ_EFFORT_SC")
    SYSTEM_PROMPT = config.get("SYSTEM_PROMPT")
    SYSTEM_PROMPT_SC = config.get("SYSTEM_PROMPT_SC")

CACHE_SUGERENCIAS_CLASES = {}  # Diccionario: { 'NombreClase': [metodos, ...] }
CACHE_FUNCIONES_GLOBALES = []  # Lista simple

if not GROQ_API_KEY:
    print("⚠️ ADVERTENCIA: GROQ_API_KEY está vacía en config.json.")
    print(
        "La funcionalidad de IA (/ask) no funcionará hasta que agregues una llave válida."
    )
    client = None
else:
    # Inicializar cliente de Groq solo si hay llave
    try:
        client = Groq(api_key=config["GROQ_API_KEY"])
    except Exception as e:
        print(f"ERROR al inicializar Groq: {e}")
        client = None


# Instrucciones del "Experto en Scriptcase" (Copiando la lógica del GPT)
# ==========================================
# 2. FUNCIONES DE APOYO (Lógica de Autocompletado)
# ==========================================
def extraer_info_clase(nombre_clase):
    global CACHE_SUGERENCIAS_CLASES

    # Si la clase ya está en el caché, la devolvemos de inmediato
    if (
        nombre_clase in CACHE_SUGERENCIAS_CLASES
        and CACHE_SUGERENCIAS_CLASES[nombre_clase]
    ):
        return CACHE_SUGERENCIAS_CLASES[nombre_clase]

    sugerencias = []
    re_metodo = re.compile(r"function\s+([a-zA-Z0-9_]+\s*\(.*?\))", re.IGNORECASE)
    re_const = re.compile(r"const\s+([A-Z0-9_]+)\s*=", re.IGNORECASE)
    re_atributo = re.compile(
        r"(?:public|protected|var|private|static)\s+\$([a-zA-Z0-9_]+)", re.IGNORECASE
    )

    for ruta in RUTAS_LIBS:
        if not os.path.exists(ruta):
            continue
        for root, _, files in os.walk(ruta):
            for file in files:
                if file.endswith(".php"):
                    try:
                        with open(
                            os.path.join(root, file),
                            "r",
                            encoding="utf-8",
                            errors="ignore",
                        ) as f:
                            content = f.read()
                            if re.search(
                                rf"class\s+{nombre_clase}", content, re.IGNORECASE
                            ):
                                sugerencias.extend(re_metodo.findall(content))
                                sugerencias.extend(re_const.findall(content))
                                sugerencias.extend(re_atributo.findall(content))
                    except:
                        pass

    resultado = list(set([s.strip() for s in sugerencias if s.strip()]))
    resultado.sort(key=str.lower)

    # Guardamos en el caché antes de retornar
    if resultado:
        CACHE_SUGERENCIAS_CLASES[nombre_clase] = resultado

    return resultado


def extraer_funciones_globales():
    global CACHE_FUNCIONES_GLOBALES

    # Si ya tenemos datos, no volvemos a escanear
    if CACHE_FUNCIONES_GLOBALES:
        return CACHE_FUNCIONES_GLOBALES

    funciones = []
    re_func = re.compile(
        r"^function\s+([a-zA-Z0-9_]+\s*\(.*?\))", re.MULTILINE | re.IGNORECASE
    )

    for ruta in RUTAS_LIBS:
        if not os.path.exists(ruta):
            continue
        for root, _, files in os.walk(ruta):
            for file in files:
                if file.endswith(".php"):
                    try:
                        with open(
                            os.path.join(root, file),
                            "r",
                            encoding="utf-8",
                            errors="ignore",
                        ) as f:
                            content = f.read()
                            if "class " not in content:
                                funciones.extend(re_func.findall(content))
                    except:
                        pass

    res = list(set(funciones))
    res.sort(key=str.lower)

    # Guardamos en la variable global
    CACHE_FUNCIONES_GLOBALES = res
    return res


def reemplazar_macros_por_dump(match):
    nombre_macro = match.group(1)
    texto_desde_macro = match.string[match.start() :]

    inicio_parentesis = texto_desde_macro.find("(")
    if inicio_parentesis == -1:
        return match.group(0)

    # Lógica de balanceo para encontrar el cierre exacto de la macro
    balance = 0
    pos_cierre = -1
    for i in range(inicio_parentesis, len(texto_desde_macro)):
        if texto_desde_macro[i] == "(":
            balance += 1
        elif texto_desde_macro[i] == ")":
            balance -= 1
            if balance == 0:
                pos_cierre = i
                break

    if pos_cierre == -1:
        return match.group(0)

    # Retornamos la variable genérica y marcamos qué parte del texto original "consumir"
    # El regex de abajo se encargará de sustituir todo este bloque
    return "$dump"


# 1. Regex que identifica el inicio de la macro
# Usamos una función para encontrar el cierre y reemplazar todo el bloque
def aplicar_filtro_dump(codigo):
    pos = 0
    while True:
        # Busca la siguiente macro sc_
        match = re.search(r"(sc_[a-zA-Z0-9_]+)\s*\(", codigo[pos:])
        if not match:
            break

        # Encontrar el cierre balanceado desde la posición actual
        nombre_macro = match.group(1)
        inicio_relativo = match.start()
        texto_recortado = codigo[pos + inicio_relativo :]

        balance = 0
        fin_relativo = -1
        for i in range(texto_recortado.find("("), len(texto_recortado)):
            if texto_recortado[i] == "(":
                balance += 1
            elif texto_recortado[i] == ")":
                balance -= 1
                if balance == 0:
                    fin_relativo = i
                    break

        if fin_relativo != -1:
            # Reemplazamos la macro completa por $dump
            parte_antes = codigo[: pos + inicio_relativo]
            parte_despues = codigo[pos + inicio_relativo + fin_relativo + 1 :]
            codigo = parte_antes + "$dump" + parte_despues
            pos = len(parte_antes) + 5  # Avanzamos después de "$dump"
        else:
            pos += inicio_relativo + 1

    return codigo


# ==========================================
# 3. LÓGICA DE LIMPIEZA (Linter & Scriptcase)
# ==========================================
def procesar_codigo_sc(codigo):
    # Limpiar disparadores
    # codigo = codigo.replace("xx", "").replace("zz", "")
    # {variable} -> $variable (evitando índices de array)
    # codigo = re.sub(r"(?<!\$)\{([a-zA-Z_][a-zA-Z0-9_]*)\}", r"$\1", codigo)
    # codigo = re.sub(r"(?<!\$)\{([^{}]+)\}", r"$\1", codigo)
    # 1. Convertir {campo} y {rs[0]['val']} en $campo y $rs[0]['val']

    # macros de sc
    codigo = aplicar_filtro_dump(codigo)  #
    # Restricción: No permite espacios inmediatamente después de { ni antes de }
    codigo = re.sub(r"(?<!\$)\{([^\s{}][^{}]*[^\s{}])\}", r"$\1", codigo)
    codigo = re.sub(r"(?<!\$)\{([^\s{}])\}", r"$\1", codigo)
    # [global] -> $global (evitando índices de array)
    codigo = re.sub(r"(?<!\$)\[([a-zA-Z_][a-zA-Z0-9_]*)\]", r"$\1", codigo)

    codigo_stripped = codigo.strip()
    if not codigo_stripped.startswith("<?php"):
        codigo_final = "<?php\n" + codigo
        offset = 1
    else:
        codigo_final = codigo
        offset = 0
    return codigo_final, offset


# ==========================================
# 4. ENDPOINTS (RUTAS)
# ==========================================
@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.json
    code = data.get("code", "")
    line_txt = data.get("line_text", "")
    tipo = data.get("type", "auto")

    if tipo == "global":
        return jsonify({"suggestions": extraer_funciones_globales()})

    # REGEX ACTUALIZADA: Captura letras, números, _, $, {}, [] y la BARRA INVERTIDA \\
    match_obj = re.search(r"([\$a-zA-Z0-9_\\\\\\[\]\{\}]+)(?:->|::)$", line_txt)

    if not match_obj:
        return jsonify({"suggestions": [], "debug": "No se detectó entidad"})

    entidad_sucia = match_obj.group(1)

    # Limpieza total para obtener solo el nombre de la clase
    # Quitamos $, {}, [] y separamos por la barra invertida para quedarnos con el final
    entidad_limpia = (
        entidad_sucia.replace("$", "")
        .replace("{", "")
        .replace("}", "")
        .replace("[", "")
        .replace("]", "")
    )

    if "\\" in entidad_limpia:
        # Si viene PhpOffice\PhpSpreadsheet\Spreadsheet, nos quedamos con Spreadsheet
        clase_final = entidad_limpia.split("\\")[-1]
    else:
        clase_final = entidad_limpia

    # Si es una instancia ($var->), buscamos el "new"
    if entidad_sucia.startswith("$"):
        var_escrita = re.escape(entidad_sucia)
        pattern = rf"{var_escrita}\s*=\s*new\s+([a-zA-Z0-9_\\]+)"
        new_match = re.search(pattern, code, re.IGNORECASE)

        if new_match:
            clase_full = new_match.group(1)
            clase_final = (
                clase_full.split("\\")[-1] if "\\" in clase_full else clase_full
            )

    mapeos = {
        "mail": "PHPMailer",
        "correo": "PHPMailer",
        "pdf": "FPDF",
        "spreadsheet": "Spreadsheet",
    }
    clase_final = mapeos.get(clase_final.lower(), clase_final)

    return jsonify({"suggestions": extraer_info_clase(clase_final)})


@app.route("/lint", methods=["POST"])
def lint_code():
    """Maneja la verificación de sintaxis (xx)"""
    data = request.json
    raw_code = data.get("code", "")
    clean_code, offset = procesar_codigo_sc(raw_code)
    with tempfile.NamedTemporaryFile(
        suffix=".php", delete=False, mode="w", encoding="utf-8"
    ) as tf:
        tf.write(clean_code)
        temp_path = tf.name

    try:
        result = subprocess.run(
            [PHP_PATH, "-l", temp_path], capture_output=True, text=True, shell=False
        )
        if result.returncode != 0:
            raw_error = (result.stdout + "\n" + result.stderr).strip()
            mensaje_sucio = raw_error.replace(temp_path, "el editor")
            match = re.search(r"[Oo]n line (\d+)", mensaje_sucio)
            linea_detectada = 0
            if match:
                linea_detectada = int(match.group(1)) - offset
                mensaje_sucio = re.sub(
                    r"[Oo]n line \d+", f"en la línea {linea_detectada}", mensaje_sucio
                )

            return jsonify(
                {"status": "error", "message": mensaje_sucio, "line": linea_detectada}
            )
        return jsonify({"status": "ok", "message": "Sintaxis Perfecta"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.route("/format", methods=["POST"])
def format_code():
    data = request.get_json(force=True)
    codigo_original = data.get("code", "")

    if not codigo_original:
        return jsonify({"code": "", "status": "success"})

    # Diccionario para guardar lo que vamos a extraer
    almacen_temporal = {}
    contador = 0

    def guardar_en_almacen(contenido):
        nonlocal contador
        key = f"SC_VAR_TEMP_{contador}_SC"
        almacen_temporal[key] = contenido
        contador += 1
        return f"${key}"

    # --- PASO 1: EXTRACCIÓN Y PROTECCIÓN ---

    # A. Extraer Macros sc_... (usando lógica de balanceo de paréntesis)
    def extraer_macros(texto):
        while True:
            match = re.search(r"(sc_[a-zA-Z0-9_]+\s*)\(", texto)
            if not match:
                break

            inicio_macro = match.start()
            balance = 0
            fin_macro = -1

            for i in range(
                inicio_macro
                + match.group(1).count("(")
                + len(nombre_macro if "nombre_macro" in locals() else ""),
                len(texto),
            ):
                # Buscamos el paréntesis de apertura real
                actual = texto[i]
                if actual == "(":
                    balance += 1
                elif actual == ")":
                    balance -= 1
                    if balance == 0:
                        fin_macro = i
                        break

            if fin_macro != -1:
                # Extraemos la macro completa: sc_algo(...)
                macro_completa = texto[inicio_macro : fin_macro + 1]
                # Si termina en punto y coma en el original, lo incluimos para que el fixer no se líe
                placeholder = guardar_en_almacen(macro_completa)
                texto = texto[:inicio_macro] + placeholder + texto[fin_macro + 1 :]
            else:
                break
        return texto

    # B. Extraer Campos {campo} y {array['idx']}
    def extraer_campos(texto):
        # Patrón que soporta {rs[0]['val']}
        patron = r"(?<!\$)\{([^\s{}][^{}]*[^\s{}])\}|(?<!\$)\{([^\s{}])\}"

        def replace_f(m):
            return guardar_en_almacen(m.group(0))

        return re.sub(patron, replace_f, texto)

    # C. Extraer Globales [global]
    def extraer_globales(texto):
        patron = r"(?<!\$)\[[a-zA-Z0-9_]+\]"
        return re.sub(patron, lambda m: guardar_en_almacen(m.group(0)), texto)

    # Aplicamos extracciones en orden
    temp_code = extraer_macros(codigo_original)
    temp_code = extraer_campos(temp_code)
    temp_code = extraer_globales(temp_code)

    # --- PASO 2: FORMATEO ---
    work_dir = DIR_TEMP
    if not os.path.exists(work_dir):
        os.makedirs(work_dir)

    path_codigo = os.path.join(work_dir, "trabajo.php")
    path_config = os.path.join(work_dir, "reglas.php")

    tiene_tag_php = temp_code.lstrip().startswith("<?")
    with open(path_codigo, "w") as f:
        f.write(temp_code if tiene_tag_php else f"<?php\n{temp_code}")

    # Configuración de reglas (ajustada a tus preferencias)
    config_content = """<?php
    return (new PhpCsFixer\\Config())
        ->setRules([
            '@PSR12' => true,
            'binary_operator_spaces' => ['default' => 'align_single_space_minimal'],
            'no_singleline_whitespace_before_semicolons' => true,
            'braces_position' => [
                'functions_opening_brace' => 'same_line',
                'classes_opening_brace' => 'same_line',
                'control_structures_opening_brace' => 'same_line',
            ],
            'no_extra_blank_lines' => ['tokens' => ['extra', 'throw', 'use', 'break', 'continue']],
        ])
        ->setIndent("    ")
        ->setUsingCache(false);
    """
    with open(path_config, "w") as f:
        f.write(config_content)

    try:
        subprocess.run(
            [PHP_FIXER_PATH, "fix", path_codigo, "--config=" + path_config, "--quiet"],
            check=False,
        )

        with open(path_codigo, "r") as f:
            code_fmt = f.read()

        # --- PASO 3: RESTAURACIÓN ---
        # Orden inverso: buscamos $SC_VAR_TEMP_..._SC y lo reemplazamos por su valor original
        for key in reversed(list(almacen_temporal.keys())):
            # Reemplazamos la variable PHP por el texto original guardado
            # Usamos replace directo para evitar problemas con caracteres especiales en regex
            code_fmt = code_fmt.replace(f"${key}", almacen_temporal[key])

        # Limpieza final del tag PHP
        if not tiene_tag_php:
            code_fmt = re.sub(
                r"^<\?php\s*", "", code_fmt, count=1, flags=re.IGNORECASE
            ).lstrip()

        return jsonify({"code": code_fmt, "status": "success"})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route("/ask", methods=["POST"])
def ask_ai():
    if client is None:
        return jsonify(
            {"status": "error", "message": "GROQ_API_KEY no configurada."}
        ), 500

    try:
        data = request.get_json(force=True)
        codigo_usuario = data.get("code", data.get("context", ""))
        # tarea = data.get("task", data.get("question", data.get("prompt", "")))
        tarea_raw = data.get(
            "task", data.get("question", data.get("prompt", ""))
        ).strip()

        # Verificamos los prefijos y limpiamos la cadena
        if tarea_raw.startswith("//SC"):
            current_system_prompt = SYSTEM_PROMPT_SC
            esfuerzo_razonamiento = GROG_EFFORT_SC
            # Borramos el prefijo //SC y limpiamos espacios sobrantes
            tarea = re.sub(r"^//SC", "", tarea_raw).strip()
            is_sc = True
        else:
            tarea = re.sub(r"^//", "", tarea_raw).strip()
            current_system_prompt = SYSTEM_PROMPT
            esfuerzo_razonamiento = GROG_EFFORT
            is_sc = False

        if not str(codigo_usuario).strip() and not str(tarea).strip():
            return jsonify({"code": "", "status": "error", "message": "Datos vacíos."})
        user_content = (
            f"CONTEXTO DEL CÓDIGO:\n{codigo_usuario}\n\nTAREA SOLICITADA:\n{tarea}"
        )

        # --- DEBUG PRINT: Verificamos qué se está enviando ---
        print("\n" + "!" * 60)
        print("🔥 ENVIANDO PETICIÓN ")
        print("!" * 60)
        print(f"Tarea: {tarea}")
        print("!" * 60 + "\n")

        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": current_system_prompt},
                {"role": "user", "content": user_content},
            ],
            model=GROQ_MODEL,
            temperature=0.0,  # Temperatura 0 para evitar alucinaciones sintácticas
            reasoning_effort=esfuerzo_razonamiento,
            max_tokens=4096,
            top_p=1,
            stream=False,
            tools=[{"type": "browser_search"}]
            if is_sc
            else None,  # Solo buscar si es Scriptcase,
        )

        respuesta = chat_completion.choices[0].message.content
        respuesta_limpia = respuesta
        # Quitar ```php o ``` al inicio
        respuesta_limpia = re.sub(
            r"^\s*```(?:php)?\s*", "", respuesta_limpia, flags=re.IGNORECASE
        )
        # Quitar ``` al final
        respuesta_limpia = re.sub(r"\s*```\s*$", "", respuesta_limpia)
        # Quitar <?php al inicio
        respuesta_limpia = re.sub(
            r"^\s*<\?php\s*", "", respuesta_limpia, flags=re.IGNORECASE
        )
        # Quitar ?> al final
        respuesta_limpia = re.sub(r"\s*\?>\s*$", "", respuesta_limpia)
        # Trim final
        respuesta_limpia = respuesta_limpia.strip()

        print("✅ RESPUESTA RECIBIDA Y LIMPIADA")

        return jsonify({"code": respuesta_limpia, "status": "success"})

    except Exception as e:
        import traceback

        print(traceback.format_exc())
        return jsonify({"status": "error", "message": str(e)})


if __name__ == "__main__":
    if not os.path.exists(PHP_PATH):
        print(f"⚠️ ADVERTENCIA: No se encontró PHP en {PHP_PATH}")
    print("🚀 Servidor IA Experimental, LINTER, FIXER en http://localhost:5005")
    app.run(port=5005, debug=True)
