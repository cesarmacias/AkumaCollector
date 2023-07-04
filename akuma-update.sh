#!/bin/bash

# Ruta del programa de Akuma
PROGRAM_PATH="/usr/local/AkumaCollector"
# Repositorio de GitHub
GITHUB_REPO="https://github.com/cesarmacias/AkumaCollector.git"

# Cambiar al directorio del programa
cd "$PROGRAM_PATH" || exit

# Guardar el usuario y grupo propietarios actuales
CURRENT_OWNER=$(stat -c '%U:%G' "$PROGRAM_PATH")

# Actualizar el repositorio de GitHub
git pull

# Actualizar los módulos de Node.js
npm install

# Comprobar si el archivo akuma.service ha sido actualizado
if [[ -f "$PROGRAM_PATH/akuma.service" ]]; then
    # Detener el servicio si está en ejecución
    systemctl is-active --quiet akuma.service && systemctl stop akuma.service

    # Copiar el archivo akuma.service actualizado a systemd
    cp "$PROGRAM_PATH/akuma.service" /etc/systemd/system/

    # Recargar los cambios en systemd
    systemctl daemon-reload

    # Iniciar el servicio nuevamente
    systemctl start akuma.service
fi

# Restaurar el usuario y grupo propietarios
chown -R "$CURRENT_OWNER" "$PROGRAM_PATH"

echo "La actualización se ha completado correctamente."
