FROM node:14

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Copy certificates
COPY cert/ cert/

# Expose port and start application
EXPOSE 3000
CMD [ "npm", "start" ]

# Change the name of the image
# from: 
#   FROM node:14
# to:
FROM node:14 AS akuma-collector