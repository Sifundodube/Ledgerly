FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.json eslint.config.mjs ./
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npm run build
EXPOSE 4000
CMD ["npm", "start"]
