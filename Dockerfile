FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY ./src ./src
COPY tsconfig.json ./
COPY nodemon.json ./

EXPOSE 3001

CMD ["npm", "run", "dev"]
