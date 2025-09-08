// swaggerConfig.js
const swaggerJsDoc = require("swagger-jsdoc");

const swaggerOptions = {
  swaggerDefinition: {
    openapi: "3.0.0",
    info: {
      title: "Butter API",
      version: "1.0.0",
      description: "API Documentation for Butter",
    },
    servers: [
      {
        url: "http://butter:3000", 
      },
    ],
  },
  apis: ["./routes/*.js"], 
};

module.exports = swaggerJsDoc(swaggerOptions);
