## Daemon

To run the akuma.js program as a service, you can use a service management tool like systemd on Linux-based operating systems. Here's a step-by-step guide on how to configure akuma.js as a service using systemd:

1. Create a service file for akuma.js. You can name it `akuma.service` and save it in the `/etc/systemd/system/` directory. You can use the following command to create the file:

```bash
sudo nano /etc/systemd/system/akuma.service
```

2. Inside the `akuma.service` file, add the following configuration:

```yml
[Unit]
Description=Akuma Collector Service
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/akuma.js
WorkingDirectory=/path/to
User=username
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Make sure to replace `/path/to/akuma.js` with the absolute path to your akuma.js file on your system. Also, adjust the `username` in the `[Service]` section according to your needs.

3. Save the file and close it.

4. Enable the service by running the following command:

```bash
sudo systemctl enable akuma
```

This will create a symbolic link for the service file and enable it to start automatically on system boot.

5. Start the service with the following command:

```bash
sudo systemctl start akuma
```

Now, akuma.js will run as a background service. You can check the status of the service using the command:

```bash
sudo systemctl status akuma
```

If you want to stop or restart the service, you can use the `sudo systemctl stop akuma` and `sudo systemctl restart akuma` commands, respectively.

Please note that the commands and paths may vary depending on your operating system and specific configuration. Make sure to adjust them according to your needs.