#!/bin/bash

# Especificar la cantidad de bytes deseada
receive_buffer_bytes=16777216

# Agregar la configuración de receive_buffer_bytes al final del archivo /etc/sysctl.conf
echo "net.core.rmem_max = $receive_buffer_bytes" | sudo tee -a /etc/sysctl.conf

# Aplicar los cambios de configuración del sistema
sudo sysctl -p
