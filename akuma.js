#!/usr/bin/env node
/* eslint-disable no-mixed-spaces-and-tabs */
"use strict";

const express = require("express");
const https = require("https");
const fs = require("fs");
const Joi = require("joi");
const net = require("net");
const snmp = require("net-snmp");
const udp = require("udp");
const _ = require("lodash");

require("dotenv").config();

async function main() {
  const pLimitModule = await import("p-limit"); // importacion dinamica de p-limit

  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // Función para enviar resultados
  const sendResult = (result) => {
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

  // Función para tratar el resultado SNMP
  const treatSNMPResult = (result, oid) => {
    if (snmp.isVarbindError(result)) {
      return {
        tag: {
          oid: oid.name,
          error: snmp.varbindError(result).toString(),
        },
      };
    }

    const values = Array.isArray(result.value) ? result.value : [result.value];
    const treatedValues = [];

    const treatOctetString = (value) => {
      if (oid.type === "hex") {
        return value.toString("hex");
      } else if (oid.type === "regex" && oid.regex) {
        const match = value.toString().match(new RegExp(oid.regex));

        if (match) {
          return Object.fromEntries(
            oid.map.map((field, index) => [field, match[index + 1]])
          );
        }
      }

      return value.toString();
    };

    const treatCounter64 = (value) => {
      return [...value.values()].reduce((acc, curr) => acc * 256 + curr, 0);
    };

    const treatOpaque = (value) => value.toString();
    const treatTimeTicks = (value) => value / 100.0;

    const treatConversion = {
      OctetString: treatOctetString,
      Counter64: treatCounter64,
      Opaque: treatOpaque,
      TimeTicks: treatTimeTicks,
    };

    const ObjectType = snmp.ObjectType[result.type.toString()];

    for (const value of values) {
      let treatedValue = value;

      if (ObjectType in treatConversion) {
        treatedValue = treatConversion[ObjectType](value);
      }

      if (oid.split) {
        treatedValue = treatedValue.split(oid.split)[0];
      }

      if (oid.conversion === "number") {
        treatedValue = +treatedValue;
      }

      if (oid.conversion === "ipv4" && typeof treatedValue === "number") {
        treatedValue = [
          (treatedValue >> 24) & 0xff,
          (treatedValue >> 16) & 0xff,
          (treatedValue >> 8) & 0xff,
          treatedValue & 0xff,
        ].join(".");
      }

      if (
        oid.conversion === "ipv4" &&
        typeof treatedValue === "string" &&
        !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(treatedValue)
      ) {
        treatedValue = treatedValue.replace(/[:.]/g, "");

        if (/^[0-9A-Fa-f]{8}$/.test(treatedValue)) {
          treatedValue = [
            parseInt(treatedValue.substr(0, 2), 16),
            parseInt(treatedValue.substr(2, 2), 16),
            parseInt(treatedValue.substr(4, 2), 16),
            parseInt(treatedValue.substr(6, 2), 16),
          ].join(".");
        }
      }
      treatedValues.push(treatedValue);
    }

    const typeField = oid.tag ? "tag" : "field";
    const treatedResult = Array.isArray(result.value)
      ? treatedValues
      : treatedValues[0];

    return {
      [typeField]: { [oid.name]: treatedResult },
    };
  };

  // Función para obtener el indice de un OID con o sin index_slice
  const oidIndex = (varbind, oid) => {
    const index = varbind.oid.substring(oid.oid.length + 1);

    if ("index_slice" in oid && Array.isArray(oid.index_slice)) {
      const [start, end] = oid.index_slice;
      const arr = index.split(".").slice(start, end);
      return arr.join(".");
    }

    return index;
  };

  // Función que devuelve una promesa para la función session.get de net-snmp
  const getAsync = (session, oidList) => {
    return new Promise((resolve, reject) => {
      session.get(oidList, (error, varbinds) => {
        if (error) {
          reject(error);
        } else {
          resolve(varbinds);
        }
      });
    });
  };

  // Función asincrónica para realizar una operación SNMP GET
  const performSNMPGet = async (data, snmpOpt, inherited, objInh) => {
    const { hosts, oids, maxConnections, measurement } = data;
    const { sessionOptions, userOptions, community } = snmpOpt;

    const limit = pLimitModule.default(maxConnections); // Limitar el número de conexiones simultáneas
    const resTotal = {};

    await Promise.all(
      hosts.map((host) =>
        limit(async () => {
          if (!(objInh && host in objInh && objInh[host] === undefined)) {
            let session;

            if (sessionOptions.version === snmp.Version3) {
              session = snmp.createV3Session(host, userOptions, sessionOptions);
            } else {
              session = snmp.createSession(host, community, sessionOptions);
            }
            const oidList = oids.map((oid) => oid.oid); // Crear un arreglo de OID solamente

            try {
              const varbinds = await getAsync(session, oidList);
              for (let i = 0; i < varbinds.length; i++) {
                const result = varbinds[i];
                const value = treatSNMPResult(result, oids[i]);

                if (!inherited) {
                  const resObj = _.merge(
                    {},
                    value,
                    { target: host, measurement },
                    objInh && objInh[host] ? objInh[host] : {},
                    data.extraInfo || {}
                  );
                  sendResult(resObj);
                }

                if (!_.has(value, "tag.error")) {
                  resTotal[host] = _.merge(resTotal[host] || {}, value);
                }
              }
            } catch (error) {
              resTotal[host] = undefined;
              console.error(
                `Error en la consulta SNMP GET para el host ${host}:`,
                error.toString()
              );
              for (const oid of oids) {
                sendResult({
                  target: host,
                  measurement: data.measurement,
                  tag: {
                    oid: oid.name,
                    error: error.toString(),
                  },
                });
              }
            }
            // Cierra la sesión SNMP
            session.close();
          }
        })
      )
    );

    return resTotal;
  };

  // Función que devuelve una promesa para la función session.subtree de net-snmp
  const subtreeAsync = (session, oid, maxRepetitions) => {
    return new Promise((resolve, reject) => {
      const results = [];

      session.subtree(
        oid,
        maxRepetitions,
        (varbinds) => {
          for (const varbind of varbinds) {
            if (!snmp.isVarbindError(varbind)) {
              results.push(varbind);
            }
          }
        },
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve(results);
          }
        }
      );
    });
  };

  // Función asincrónica para realizar una operación SNMP SUBTREE
  const snmpTable = async (data, snmpOpt, objInh) => {
    const { hosts, oids, maxRepetitions, maxConnections, measurement } = data;
    const { sessionOptions, userOptions, community } = snmpOpt;

    const limit = pLimitModule.default(maxConnections); // Limitar el número de conexiones simultáneas

    const promises = hosts.map((host) =>
      limit(async () => {
        let session;
        const results = {};

        if (sessionOptions.version === snmp.Version3) {
          session = snmp.createV3Session(host, userOptions, sessionOptions);
        } else {
          session = snmp.createSession(host, community, sessionOptions);
        }

        try {
          for (const oid of oids) {
            const varbinds = await subtreeAsync(
              session,
              oid.oid,
              maxRepetitions
            );

            for (const varbind of varbinds) {
              const index = oidIndex(varbind, oid);
              const value = treatSNMPResult(varbind, oid);

              results[index] = _.merge({}, results[index], value);
            }
          }
        } catch (error) {
          console.error(
            `Error en la consulta SNMP GET TABLE para el host ${host}:`,
            error.toString()
          );
        }

        session.close();

        for (const [key, value] of Object.entries(results)) {
          const resObj = _.merge(
            {},
            value,
            { target: host, measurement, index: key },
            objInh && objInh[host] ? objInh[host] : {},
            data.extraInfo || {}
          );
          sendResult(resObj);
        }

        return results;
      })
    );

    await Promise.all(promises);
  };

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
            split: Joi.string(),
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
            true
          )
        : undefined;

      await performSNMPGet(data, snmpOpt, false, inh);

      res.sendStatus(200);
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
            true
          )
        : undefined;

      await snmpTable(data, snmpOpt, inh);

      res.sendStatus(200);
    } catch (error) {
      console.error("Error en la ruta snmp/table:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Asignación de variables de entorno a variables del código
  const sendHost = process.env.SEND_HOST;
  const sendPort = process.env.SEND_PORT;
  const listenPort = process.env.LISTEN_PORT;
  let sendOption = process.env.SEND_OPTION;
  const privateKeyPath = process.env.PRIVATE_KEY_PATH;
  const certificatePath = process.env.CERTIFICATE_PATH;

  // Verificación de variables de entorno requeridas
  if (
    !sendHost ||
    !sendPort ||
    !listenPort ||
    !sendOption ||
    !privateKeyPath ||
    !certificatePath
  ) {
    console.error("Debe especificar las variables de entorno correctamente:");
    console.error(
      "SEND_HOST, SEND_PORT, LISTEN_PORT, SEND_OPTION, PRIVATE_KEY_PATH, CERTIFICATE_PATH"
    );
    process.exit(1);
  }

  // Si NODE_ENV es "debug", cambiar sendOption a "log"
  if (process.env.NODE_ENV === "debug") {
    sendOption = "log";
  }

  // Validar si no se pueden abrir el certificado o la clave privada
  try {
    // Leer el certificado y la clave privada
    const privateKey = fs.readFileSync(privateKeyPath);
    const certificate = fs.readFileSync(certificatePath);

    // Configurar el servidor HTTPS
    const options = {
      key: privateKey,
      cert: certificate,
    };

    // Crear el servidor HTTPS
    const server = https.createServer(options);

    // Configuración del puerto y la aplicación
    server.listen(listenPort, () => {
      console.log(`Server listening on port ${listenPort}`);
    });

    // Asignar la aplicación al servidor
    server.on("request", app);
  } catch (error) {
    console.error("Error al abrir el certificado o la clave privada:", error);
    process.exit(1);
  }
}

main();
