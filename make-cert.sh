#!/bin/bash

# Cargar variables de entorno desde el archivo .env
export $(cat .env | xargs)

# Variables
ssl_dir="$SSL_DIR"              # Directorio para los certificados
common_name="$COMMON_NAME"      # Nombre común (dominio)
country="$COUNTRY"              # País
state="$STATE"                  # Estado
locality="$LOCALITY"            # Localidad
organization="$ORGANIZATION"    # Organización
email="$EMAIL"                  # Correo electrónico

# Verificar si el directorio no existe
if [ ! -d "$ssl_dir" ]; then
    # Crear directorio para almacenar los certificados
    mkdir "$ssl_dir"
fi

cd "$ssl_dir" || exit

# Generar clave privada
openssl genrsa -out private.key 2048

# Generar solicitud de firma de certificado (CSR)
openssl req -new -key private.key -out csr.csr -subj "/C=$country/ST=$state/L=$locality/O=$organization/CN=$common_name/emailAddress=$email"

# Generar certificado autofirmado válido por 365 días
openssl x509 -req -days 365 -in csr.csr -signkey private.key -out certificate.crt

echo "Se han creado los certificados SSL en el directorio '$ssl_dir'."
