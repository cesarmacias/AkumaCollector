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
      [oid.tag ? "tag" : "field"]: {
        [oid.name]: snmp.varbindError(result).toString(),
      },
    };
  }

  const treatOctetString = (value) => {
    if (oid.type === "hex") {
      return value.toString("hex");
    } else if (oid.type === "regex" && oid.regex) {
      const match = value.toString().match(new RegExp(oid.regex));

      if (match) {
        const [, ...fields] = match; // Ignore the full match

        return Object.fromEntries(
          oid.map.map((field, index) => [field, fields[index]])
        );
      }
    }

    return value.toString();
  };

  const treatCounter64 = (value) => {
    return [...value.values()].reduce((acc, curr) => acc * 256 + curr, 0);
  };

  const treatConversion = {
    OctetString: treatOctetString,
    Counter64: treatCounter64,
    Opaque: (value) => value.toString(),
    TimeTicks: (value) => value / 100,
  };

  const ObjectType = snmp.ObjectType[result.type.toString()];

  const value = result.value;
  let treatedValue = value;

  if (ObjectType in treatConversion) {
    treatedValue = treatConversion[ObjectType](value);
  }

  if (oid.split && typeof treatedValue === "string") {
    const separator = Array.isArray(oid.split) ? oid.split[0] : oid.split;
    const limit = Array.isArray(oid.split) ? oid.split[1] : undefined;
    treatedValue = treatedValue.split(separator, limit);
  }

  const treatedValues = Array.isArray(treatedValue)
    ? treatedValue
    : [treatedValue];

  const treatedResult = treatedValues.map((treatedValue) => {
    if (oid.conversion === "number") {
      return +treatedValue;
    }

    if (oid.conversion === "ipv4") {
      if (typeof treatedValue === "number") {
        return [
          (treatedValue >> 24) & 0xff,
          (treatedValue >> 16) & 0xff,
          (treatedValue >> 8) & 0xff,
          treatedValue & 0xff,
        ].join(".");
      }

      if (
        typeof treatedValue === "string" &&
        !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(treatedValue)
      ) {
        treatedValue = treatedValue.replace(/[:.]/g, "");

        if (/^[0-9A-Fa-f]{8}$/.test(treatedValue)) {
          return [
            parseInt(treatedValue.substr(0, 2), 16),
            parseInt(treatedValue.substr(2, 2), 16),
            parseInt(treatedValue.substr(4, 2), 16),
            parseInt(treatedValue.substr(6, 2), 16),
          ].join(".");
        }
      }
    }

    return treatedValue;
  });

  const typeField = oid.tag ? "tag" : "field";
  const treatedResultValue =
    treatedValues.length === 1 ? treatedResult[0] : treatedResult;

  return {
    [typeField]: { [oid.name]: treatedResultValue },
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
const performSNMPGet = async (data, snmpOpt, inherited, objInh, sendMsg) => {
  const { hosts, oids, maxConnections, measurement } = data;
  const { sessionOptions, userOptions, community } = snmpOpt;

  const plimit = await importPLimit();
  const limit = plimit(maxConnections); // Limitar el número de conexiones simultáneas
  const resTotal = {};
  let cnt = 0;

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
            const pollertime = Date.now() / 1000;
            for (let i = 0; i < varbinds.length; i++) {
              const result = varbinds[i];
              const value = treatSNMPResult(result, oids[i]);

              if (!inherited) {
                const resObj = _.merge(
                  {},
                  value,
                  { target: host, measurement },
                  { pollertime },
                  objInh && objInh[host] ? objInh[host] : {},
                  data.extraInfo || {}
                );
                sendResult(resObj, sendMsg);
                cnt++;
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
                sendMsg
              );
            }
          }
          // Cierra la sesión SNMP
          session.close();
        }
      })
    )
  );
  return cnt;
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
const snmpTable = async (data, snmpOpt, objInh, sendMsg) => {
  const { hosts, oids, maxRepetitions, maxConnections, measurement } = data;
  const { sessionOptions, userOptions, community } = snmpOpt;

  const plimit = await importPLimit();
  const limit = plimit(maxConnections); // Limitar el número de conexiones simultáneas
  let cnt = 0;

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
          const pollertime = Date.now() / 1000;

          for (const varbind of varbinds) {
            const index = oidIndex(varbind, oid);
            const value = treatSNMPResult(varbind, oid);

            results[index] = _.merge({}, results[index], { pollertime }, value);
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
        sendResult(resObj, sendMsg);
        cnt++;
      }

      return results;
    })
  );
  await Promise.all(promises);

  return cnt;
};

module.exports = { snmp, snmpTable, performSNMPGet };
