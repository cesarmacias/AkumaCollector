#!/bin/bash

# Ruta de instalación del programa
INSTALLATION_PATH="/usr/local/AkumaCollector"

# Usuario y grupo
USER="akuma"
GROUP="akuma"

# Crear el grupo si no existe
sudo groupadd -r $GROUP 2>/dev/null || true

# Crear el usuario si no existe
sudo useradd -r -g $GROUP -md $INSTALLATION_PATH -s /usr/sbin/nologin $USER 2>/dev/null || true

# Crear el directorio de instalación si no existe
sudo mkdir -p $INSTALLATION_PATH

# Descargar el repositorio y extraer los archivos en el directorio de instalación
sudo curl -LsS https://github.com/cesarmacias/AkumaCollector/archive/refs/heads/main.tar.gz | sudo tar -xz -C $INSTALLATION_PATH --strip-components=1

# Cambiar los permisos de la carpeta de instalación
sudo chown -R $USER:$GROUP $INSTALLATION_PATH

# Instalar los módulos con npm en el directorio de instalación
sudo -u $USER npm install --prefix $INSTALLATION_PATH

# Copiar el archivo de servicio
sudo cp $INSTALLATION_PATH/akuma.service /etc/systemd/system/

# Recargar la configuración de systemd
sudo systemctl daemon-reload

# Habilitar y iniciar el servicio
sudo systemctl enable akuma.service
sudo systemctl start akuma.service
