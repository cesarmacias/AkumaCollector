# Akuma Collector

This repository contains the source code for the Akuma Collector application.

## Docker Image Creation using Docker Compose

### Prerequisites
- Docker
- Docker Compose

### Steps

1. Clone this repository to your local machine:

   ```bash
   git clone <https://github.com/cesarmacias/AkumaCollector.git>
   ```

2. Navigate to the project directory:

   ```bash
   cd AkumaCollector
   ```

3. Create a `.env` file in the project directory and define any necessary environment variables. For example:

   ```
    SEND_HOST="localhost"
    SEND_PORT=8080
    LISTEN_PORT=3000
    SEND_OPTION="udp"
    PRIVATE_KEY_PATH="cert/server.key"
    CERTIFICATE_PATH="cert/server.crt"
   ```

4. Build the iamge Docker container using Docker Compose:

   ```bash
   docker compose build --no-cache
   docker compose up -d
   ```

   This command will build the Docker image and start the containers based on the configuration defined in the `docker-compose.yml` file.

## Validating the Running Image

To validate that the Akuma Collector Docker image is running correctly, follow these steps:

1. Open a terminal or command prompt.

2. Run the following command:

   ```bash
   docker ps
   ```

   This command lists all the running Docker containers on your system.

3. Look for the image `akuma-collector` is in the list. The output will include information such as the container ID, image name, status, and ports.

4. Test the Akuma Collector application port:

   ```bash
   telnet localhost 3000
   ```

   This will return `Connected to localhost`.

## Pushing the Image to Docker Hub

To push the Akuma Collector Docker image to Docker Hub, follow these steps:

1. Ensure you have an account on Docker Hub (hub.docker.com).

2. Log in to Docker Hub using the following command:

   ```bash
   docker login
   ```

   Provide your Docker Hub username and password when prompted.

3. Navigate to the project directory that contains the `Dockerfile` and `docker-compose.yml` files.

4. Tag the Docker image with your Docker Hub username and repository name using the following command:

   ```bash
   docker tag akuma-collector:0.1 your-dockerhub-username/akuma-collector:0.1
   ```

5. Push the Docker image to Docker Hub using the following command:

   ```bash
   docker push your-dockerhub-username/akuma-collector:0.1
   ```

   Docker will upload the image to your Docker Hub repository.
