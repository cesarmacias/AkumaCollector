FROM node:18-alpine AS akuma

# Create app directory
RUN mkdir -p /home/node/app/node_modules
RUN mkdir -p /home/node/app/cert 

# Define working directory
WORKDIR /home/node/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY --chown=node:node . .

# Copy certificates
COPY --chown=node:node cert/ cert/

# start main app
CMD [ "npm", "start" ]