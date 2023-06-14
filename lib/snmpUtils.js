/* eslint-disable no-mixed-spaces-and-tabs */
"use strict";

const snmp = require("net-snmp");
const _ = require("lodash");

const { sendResult } = require("./funcUtils");

// Carga dinamica de p-limit
let pLimit;

const importPLimit = async () => {
  if (!pLimit) {
    const pLimitModule = await import("p-limit");
    pLimit = pLimitModule.default;
  }
  return pLimit;
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
const performSNMPGet = async (data, snmpOpt, inherited, objInh, sendOption) => {
  const { hosts, oids, maxConnections, measurement } = data;
  const { sessionOptions, userOptions, community } = snmpOpt;

  const plimit = await importPLimit();
  const limit = plimit(maxConnections); // Limitar el número de conexiones simultáneas
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
                sendResult(resObj, sendOption);
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
              sendResult(
                {
                  target: host,
                  measurement: data.measurement,
                  tag: {
                    oid: oid.name,
                    error: error.toString(),
                  },
                },
                sendOption
              );
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
const snmpTable = async (data, snmpOpt, objInh, sendOption) => {
  const { hosts, oids, maxRepetitions, maxConnections, measurement } = data;
  const { sessionOptions, userOptions, community } = snmpOpt;

  const plimit = await importPLimit();
  const limit = plimit(maxConnections); // Limitar el número de conexiones simultáneas

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
          const varbinds = await subtreeAsync(session, oid.oid, maxRepetitions);

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
        sendResult(resObj, sendOption);
      }

      return results;
    })
  );

  await Promise.all(promises);
};

module.exports = { snmp, snmpTable, performSNMPGet };
