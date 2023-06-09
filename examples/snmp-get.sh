#!/bin/bash

# Cargar variables de entorno desde el archivo .env
export $(cat .env | xargs)

# Datos del servidor HTTPS
URL="https://$COMMON_NAME:$LISTEN_PORT/snmp/get" # Generar la URL
CERTIFICATE="$CERTIFICATE_PATH"                # Ruta al certificado del cliente
PRIVATE_KEY="$PRIVATE_KEY_PATH"                # Ruta a la clave privada del cliente

# Validar la existencia del archivo JSON
JSON_FILE="$1"
if [ ! -f "$JSON_FILE" ]; then
    echo "El archivo JSON no existe."
    exit 1
fi

# Leer el contenido del archivo JSON y almacenarlo en una variable
JSON_DATA=$(cat "$JSON_FILE")

# Enviar la solicitud HTTPS
curl -X POST \
    -H "Content-Type: application/json" \
    --cacert "$CERTIFICATE" \
    --cert "$CERTIFICATE" \
    --key "$PRIVATE_KEY" \
    -d "$JSON_DATA" \
    "$URL"
