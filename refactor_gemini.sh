

#!/bin/bash

# INSTRUCCION="Aplica el patrón 'Split Monolith'.
# METODOLOGÍA DE EJECUCIÓN ESTRICTA:
# Paso 1 (Mapeo de Dependencias): Lee el archivo objetivo. Identifica todos los 'import' que referencien archivos locales del proyecto. DEBES usar obligatoriamente tu herramienta 'read_file' (no uses 'read_multiple_files') para inspeccionar el código fuente de esas dependencias y memorizar sus Tipos e Interfaces.
# Paso 2 (Descomposición Física): Crea archivos nuevos en el mismo directorio (ej. 'types.ts', 'services.ts') y extrae allí las interfaces y la lógica de negocio.
# Paso 3 (Ensamblaje del Orquestador): NO elimines el archivo 'main.ts'. Bórrale la lógica pesada y conviértelo en un puente que importe los nuevos submódulos. Mantén la firma 'export async function main(...)' absolutamente intacta.
# Paso 4 (Resolución del Grafo): Inyecta todos los 'import' y 'export' relativos exactos para que la conexión entre los archivos nuevos y las dependencias externas sea matemáticamente perfecta."

INSTRUCCION="Aplica refactorización bajo los principios de programacion SOLID, DRY and KISS a este archivo. Reglas obligatorias: 1. No modifiques la firma de las funciones exportadas (ej. export async function main). 2. No alteres ni elimines los imports relativos existentes. 3. Solo mejora la lógica interna y la legibilidad. 4. NO elimines el archivo main.ts si es un endpoint de Windmill.
DEBES usar obligatoriamente tu herramienta 'read_file' (no uses 'read_multiple_files') para inspeccionar el código fuente de esas dependencias y memorizar sus Tipos e Interfaces."


MANIFEST="manifiesto_refactor.txt"

# Activar modo "Exit on Error" para interrumpir si haces Ctrl+C
set -e

if [ ! -f "$MANIFEST" ]; then
    echo "[SISTEMA] Generando el inventario de estado cero..."
    find f/ -type f -name "*.ts" | awk '{print "PENDIENTE:"$0}' > "$MANIFEST"
    echo "[SISTEMA] Inventario creado."
fi

# Desactivamos set -e temporalmente para manejar los errores manualmente en el bucle
set +e

grep -E "^(PENDIENTE|ERROR):" "$MANIFEST" | while IFS=':' read -r ESTADO ARCHIVO; do
    echo "=========================================================="
    echo "[PROCESANDO] $ARCHIVO (Estado previo: $ESTADO)"
    echo "=========================================================="

    # 1. EJECUCIÓN DEL AGENTE Y CAPTURA DE ERROR DE CUOTA
    gemini -y -p "$INSTRUCCION. El archivo a modificar es: $ARCHIVO" < /dev/null
    EXIT_CODE_GEMINI=$?

    # Si el agente falló (Ej. Cuota agotada, red caída o Ctrl+C)
    if [ $EXIT_CODE_GEMINI -ne 0 ]; then
        echo "[FALLO CRÍTICO] El agente Gemini colapsó o la API rechazó la conexión (Código: $EXIT_CODE_GEMINI)."
        # Asegurar que el archivo quede marcado como ERROR
        sed -i "s|^.*:$ARCHIVO$|ERROR:$ARCHIVO|" "$MANIFEST"
        echo "[SISTEMA] ABORTANDO EJECUCIÓN. Espera a que se reinicie tu cuota."
        exit 1
    fi

    # 2. COMPUERTA DE VALIDACIÓN ESTÁTICA
    echo "[VERIFICANDO] Ejecutando npx tsc --noEmit..."
    npx tsc --noEmit
    EXIT_CODE_TSC=$?

    if [ $EXIT_CODE_TSC -eq 0 ]; then
        echo "[ÉXITO] Verificación superada. Guardando estado y commits."
        DIR_ARCHIVO=$(dirname "$ARCHIVO")

        # OBLIGAR a git a añadir solo si hay cambios. Si no hay cambios, no hacer commit.
        if [[ -n $(git status -s "$DIR_ARCHIVO") ]]; then
            git add "$DIR_ARCHIVO"/*.ts
            git commit -m "refactor(auto): split monolith y tipado estricto en $DIR_ARCHIVO"
        fi

        sed -i "s|^.*:$ARCHIVO$|HECHO:$ARCHIVO|" "$MANIFEST"
    else
        echo "[FALLO CRÍTICO] El analizador de TypeScript detectó un error en el código generado."
        DIR_ARCHIVO=$(dirname "$ARCHIVO")
        git checkout -- "$DIR_ARCHIVO"/*.ts 2>/dev/null
        git clean -fd "$DIR_ARCHIVO" 2>/dev/null
        sed -i "s|^.*:$ARCHIVO$|ERROR:$ARCHIVO|" "$MANIFEST"
        echo "[SISTEMA] PROCESO ABORTADO."
        exit 1
    fi

    # NUEVO: Válvula de enfriamiento térmico para la API (Evita el Error 429 de RPM)
    echo "[SISTEMA] Enfriando tubería por 15 segundos para recargar tokens de la API..."
    sleep 5

done

echo "=========================================================="
echo "[SISTEMA] EJECUCIÓN FINALIZADA."
