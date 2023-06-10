#!/bin/bash

# Cargar variables de entorno desde el archivo .env
export $(cat .test.env | xargs)

# Datos del servidor HTTPS
URL="https://$DOMAIN:$LISTEN_PORT/snmp/get" # Generar la URL
CERTIFICATE="$CLIENT_CRT"                # Ruta al certificado del cliente
PRIVATE_KEY="$CLIENT_KEY"                # Ruta a la clave privada del cliente
CACERT="$CERTIFICATE_PATH"

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
    --cacert "$CACERT" \
    --cert "$CERTIFICATE" \
    --key "$PRIVATE_KEY" \
    -d "$JSON_DATA" \
    "$URL"
