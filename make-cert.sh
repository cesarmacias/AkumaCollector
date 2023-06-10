#!/bin/bash

# Verificar que el archivo .cert.env exista
if [[ ! -f ".cert.env" ]]; then
  echo "Error: El archivo .cert.env no existe."
  exit 1
fi

# Cargar las variables de entorno desde el archivo .cert.env
source .cert.env

# Verificar que todas las variables de entorno requeridas estén definidas
if [[ -z "$CERT_DIR" || -z "$SERVER_CERT_NAME" || -z "$CLIENT_CERT_NAME" || -z "$DOMAIN" || -z "$CERT_EXPIRY_DAYS" ]]; then
  echo "Error: Variables de entorno faltantes."
  exit 1
fi

# Crear directorio para almacenar los certificados si no existe
mkdir -p "$CERT_DIR"

# Generar clave privada y solicitud de certificado para el servidor
openssl genpkey -algorithm RSA -out "$CERT_DIR/server.key" -pkeyopt rsa_keygen_bits:4096
openssl req -new -key "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" -subj "/CN=$DOMAIN"
openssl x509 -req -in "$CERT_DIR/server.csr" -signkey "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt" -days "$CERT_EXPIRY_DAYS" -sha256

# Generar clave privada y solicitud de certificado para el cliente
openssl genpkey -algorithm RSA -out "$CERT_DIR/client.key" -pkeyopt rsa_keygen_bits:4096
openssl req -new -key "$CERT_DIR/client.key" -out "$CERT_DIR/client.csr" -subj "/CN=$DOMAIN"
openssl x509 -req -in "$CERT_DIR/client.csr" -signkey "$CERT_DIR/client.key" -out "$CERT_DIR/client.crt" -days "$CERT_EXPIRY_DAYS" -sha256

# Mostrar información sobre los certificados generados
echo "Certificado del servidor:"
openssl x509 -in "$CERT_DIR/server.crt" -text -noout

echo "Certificado del cliente:"
openssl x509 -in "$CERT_DIR/client.crt" -text -noout
