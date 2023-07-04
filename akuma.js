#!/usr/bin/env node
/* eslint-disable no-mixed-spaces-and-tabs */
"use strict";

const express = require("express");
const https = require("https");
const http = require("http");
const fs = require("fs");
const Joi = require("joi");

const { snmp, performSNMPGet, snmpTable } = require("./lib/snmpUtils");

require("dotenv").config();

const app = express();
app.use(express.json({ limit: "10mb" }));

// Valida la estructura del JSON común para todas las rutas
const validateCommonJSON = (req, res, next) => {
  const schema = Joi.object({
    hosts: Joi.array().items(Joi.string()).required(),
    community: Joi.string().when("options.version", {
      is: Joi.string().valid("1", "2c"),
      then: Joi.required(),
    }),
    maxRepetitions: Joi.number().default(20).optional(),
    measurement: Joi.string().required(),
    options: Joi.object({
      version: Joi.string().required(),
      retries: Joi.number().default(2).optional(),
      timeout: Joi.number().default(500).optional(),
      port: Joi.number().default(161).optional(),
    }).required(),
    user: Joi.object({
      name: Joi.string().required(),
      level: Joi.string().required(),
      authProtocol: Joi.string().required(),
      privProtocol: Joi.string().required(),
      privKey: Joi.string().required(),
      authKey: Joi.string().required(),
    }).when("options.version", {
      is: Joi.string().valid("3"),
      then: Joi.required(),
    }),
    oids: Joi.array()
      .items(
        Joi.object({
          oid: Joi.string().required(),
          name: Joi.string().required(),
          type: Joi.string().valid("hex", "regex"),
          conversion: Joi.string().valid("ipv4", "number"),
          tag: Joi.boolean(),
          index_slice: Joi.array().items(Joi.number().integer()).min(1).max(2),
          regex: Joi.string().when("type", {
            is: "regex",
            then: Joi.required(),
          }),
          map: Joi.array().items(Joi.string()).when("type", {
            is: "regex",
            then: Joi.required(),
          }),
          split: Joi.alternatives()
            .try(
              Joi.string(),
              Joi.array().length(2).ordered(Joi.string(), Joi.number())
            )
            .optional(),
        })
      )
      .required(),
    maxConnections: Joi.number().integer().min(1).default(500),
    inherited: Joi.array()
      .items(
        Joi.object({
          oid: Joi.string().required(),
          name: Joi.string().required(),
          tag: Joi.boolean().default(true),
        })
      )
      .optional(),
    extraInfo: Joi.object().optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    console.error(error);
    return res.status(400).json({ error: "Invalid JSON format" });
  }

  req.body = value;

  // Crear sessionOptions
  const { options, user } = req.body;
  const sessionOptions = {
    version: snmp.Version[options.version],
    retries: options.retries,
    timeout: options.timeout,
    port: options.port,
  };

  // Crear userOptions cuando es SNMP V3
  const userOptions =
    options.version === "3"
      ? {
          name: user.name,
          level: snmp.SecurityLevel[user.level] || 1,
          authProtocol: snmp.AuthProtocols[user.authProtocol] || undefined,
          privProtocol: snmp.PrivProtocols[user.privProtocol] || undefined,
          privKey: user.privKey,
          authKey: user.authKey,
        }
      : undefined;

  const community = ["1", "2c"].includes(options.version)
    ? req.body.community
    : undefined;

  const snmpOpt = {
    sessionOptions,
    userOptions,
    community,
  };
  req.snmpOpt = snmpOpt;

  next();
};

// Ruta snmp/get
app.post("/snmp/get", validateCommonJSON, async (req, res) => {
  try {
    const data = req.body;
    const snmpOpt = req.snmpOpt;

    const inh = data.inherited
      ? await performSNMPGet(
          {
            hosts: data.hosts,
            oids: data.inherited,
            maxConnections: data.maxConnections,
            measurement: data.measurement,
          },
          snmpOpt,
          true,
          undefined,
          sendMsg
        )
      : undefined;

      const processData = await performSNMPGet(data, snmpOpt, false, inh, sendMsg);

    res.status(200).send({ mensaje: 'Transacción exitosa', cantidad: Object.keys(processData).length });
  } catch (error) {
    console.error("Error en la ruta snmp/get:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Ruta snmp/get
app.post("/snmp/table", validateCommonJSON, async (req, res) => {
  try {
    const data = req.body;
    const snmpOpt = req.snmpOpt;

    const inh = data.inherited
      ? await performSNMPGet(
          {
            hosts: data.hosts,
            oids: data.inherited,
            maxConnections: data.maxConnections,
            measurement: data.measurement,
          },
          snmpOpt,
          true,
          undefined,
          sendMsg
        )
      : undefined;

    const processData = await snmpTable(data, snmpOpt, inh, sendMsg);

    res.status(200).send({ mensaje: 'Transacción exitosa', cantidad: processData });
  } catch (error) {
    console.error("Error en la ruta snmp/table:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Asignación de variables de entorno a variables del código
const sendHost = process.env.SEND_HOST;
const sendPort = process.env.SEND_PORT;
const listenPort = process.env.LISTEN_PORT;
const protocol = process.env.PROTOCOL.toLowerCase(); // Variable de entorno para especificar el protocolo (http o https)
const sendOption =
  process.env.NODE_ENV === "debug" ? "log" : process.env.SEND_OPTION;
const privateKeyPath =
  protocol === "https" ? process.env.PRIVATE_KEY_PATH : true;
const certificatePath =
  protocol === "https" ? process.env.CERTIFICATE_PATH : true;
const sendMsg = { sendHost, sendPort, sendOption }; // Definir objeto para envio de mensajes

// Verificación de variables de entorno requeridas
if (
  !sendHost ||
  !sendPort ||
  !listenPort ||
  !sendOption ||
  !privateKeyPath ||
  !certificatePath ||
  !protocol
) {
  console.error("Debe especificar las variables de entorno correctamente:");
  console.error(
    "SEND_HOST, SEND_PORT, LISTEN_PORT, SEND_OPTION, PRIVATE_KEY_PATH (https), CERTIFICATE_PATH (https), PROTOCOL"
  );
  process.exit(1);
}

// Validar si no se pueden abrir el certificado o la clave privada
try {
  // Configurar el servidor HTTP
  let server = http.createServer();
  if (protocol === "https") {
    // Leer el certificado y la clave privada
    const privateKey = fs.readFileSync(privateKeyPath);
    const certificate = fs.readFileSync(certificatePath);
    const options = {
      key: privateKey,
      cert: certificate,
    };

    // Configurar el servidor HTTPS
    server = https.createServer(options);
  }
  // Configuración del puerto y la aplicación
  server.listen(listenPort, () => {
    console.log(`Server ${protocol} listening on port ${listenPort}`);
  });

  // Asignar la aplicación al servidor
  server.on("request", app);
} catch (error) {
  console.error("Error al abrir el certificado o la clave privada:", error);
  process.exit(1);
}
