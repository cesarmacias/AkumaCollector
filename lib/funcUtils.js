/* eslint-disable no-mixed-spaces-and-tabs */
"use strict";

const net = require("net");
const udp = require("udp");

// Función para enviar resultados
const sendResult = (result, sendOption) => {
  if (sendOption === "tcp") {
    sendResultByTCP(result);
  } else if (sendOption === "udp") {
    sendResultByUDP(result);
  } else if (sendOption === "log") {
    console.log(result);
  } else {
    console.error("SEND_OPTION solo puede ser: tcp, udp o log (para debug)");
  }
};

// Función para enviar los resultados por TCP
const sendResultByTCP = (result) => {
  const client = new net.Socket();

  client.connect(sendPort, sendHost, () => {
    const jsonResult = JSON.stringify(result);
    client.write(jsonResult);
    client.end();
  });

  client.on("error", (error) => {
    console.error("Error al enviar los resultados por TCP:", error);
  });
};

// Función para enviar los resultados por TCP
const sendResultByUDP = (result) => {
  const client = udp.createSocket("udp4");

  const jsonResult = JSON.stringify(result);
  const message = Buffer.from(jsonResult);

  client.send(message, 0, message.length, sendPort, sendHost, (error) => {
    if (error) {
      console.error("Error al enviar los resultados por UDP:", error);
    } else {
      console.log("Resultados enviados por UDP");
    }

    client.close();
  });
};

module.exports = { sendResult };
