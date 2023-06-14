#!/bin/bash

# Cargar variables de entorno desde el archivo .env
source .env

# Ruta del API a invocar - test
ROUTE="$1"

if [ "$PROTOCOL" = "http" ]; then
  URL="http://$DOMAIN:$LISTEN_PORT/$ROUTE"
else
  URL="https://$DOMAIN:$LISTEN_PORT/$ROUTE"
fi

# Datos del servidor HTTPS
CERTIFICATE="$CLIENT_CRT"                   # Ruta al certificado del cliente
PRIVATE_KEY="$CLIENT_KEY"                   # Ruta a la clave privada del cliente
CACERT="$CERTIFICATE_PATH"

# Validar la existencia del archivo JSON
JSON_FILE="$2"
if [ ! -f "$JSON_FILE" ]; then
    echo "El archivo JSON no existe."
    exit 1
fi

# Leer el contenido del archivo JSON y almacenarlo en una variable
JSON_DATA=$(cat "$JSON_FILE")

# Verificar la validez del archivo JSON
if ! echo "$JSON_DATA" | jq . >/dev/null 2>&1; then
    echo "El archivo JSON no es válido."
    exit 1
fi

# Enviar la solicitud HTTP o HTTPS según el protocolo especificado
if [ "$PROTOCOL" = "http" ]; then
  curl -X POST \
    -H "Content-Type: application/json" \
    -d "$JSON_DATA" \
    "$URL"
else
  curl -X POST \
    -H "Content-Type: application/json" \
    --cacert "$CACERT" \
    --cert "$CERTIFICATE" \
    --key "$PRIVATE_KEY" \
    -d "$JSON_DATA" \
    "$URL"
fi


