import json
import os
import re
import subprocess
import tempfile

from flask import Flask, jsonify, request
from flask_cors import CORS

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
    PHP_PATH = config.get("PHP_PATH")
    RUTAS_LIBS = config.get("RUTAS_LIBS", [])  # Retorna lista vacía si no existe

CACHE_SUGERENCIAS_CLASES = {}  # Diccionario: { 'NombreClase': [metodos, ...] }
CACHE_FUNCIONES_GLOBALES = []  # Lista simple


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


if __name__ == "__main__":
    if not os.path.exists(PHP_PATH):
        print(f"⚠️ ADVERTENCIA: No se encontró PHP en {PHP_PATH}")
    print("Servidor IA Experimental, LINTER, FIXER en http://localhost:5005")
    app.run(port=5005, debug=True)
