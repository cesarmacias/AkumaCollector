# AkumaCollector

AkumaCollector is a Node.js-based data collection tool that utilizes SNMP and other APIs to gather information from various sources. It allows real-time monitoring, transformation, and storage of diverse data types, enabling centralized insights for informed decision-making.

## Installation

1. Clone the repository: `git clone https://github.com/cesarmacias/AkumaCollector.git`
2. Install dependencies: `npm install`

## Usage

1. Set the required environment variables in a `.env` file or your preferred method.
2. Run AkumaCollector, option 1: `node akuma.js`
3. Run AkumaCollector, option 2: `npm run start`
4. Run AkumaCollector, in debug: `npm run debug` 

## Configuration

Modify the `.env` file to configure the following options:

- `SEND_HOST`: The host to which the collected data will be sent.
- `SEND_PORT`: The port number on the host to which the data will be sent.
- `LISTEN_PORT`: The port number on which AkumaCollector will listen for API requests.
- `SEND_OPTION`: The option for sending the results (tcp, udp, or log for debugging).
- `PRIVATE_KEY_PATH`: The path to the private key file for HTTPS server.
- `CERTIFICATE_PATH`: The path to the certificate file for HTTPS server.
- `SSL_DIR`: The path to the directory that will have private key and certificate
- `COMMON_NAME`: Domain for certificate
- `COUNTRY`: Country for certificate
- `STATE`: State for certificate
- `LOCALITY`: City for certificate
- `ORGANIZATION`: Organization name for certificate
- `EMAIL`: Email for certificate

## API Routes

- `POST /snmp/get`: Performs SNMP GET operation based on the provided JSON payload. Validates and retrieves data from the specified hosts using SNMP.

## JSON Payload Structure

The JSON payload sent to `/snmp/get` route should follow the below structure:

```json
{
  "hosts": ["host1", "host2"],
  "community": "public",
  "maxRepetitions": 50,
  "measurement": "measurement_name",
  "options": {
    "version": "2c",
    "retries": 2,
    "timeout": 500,
    "port": 161
  },
  "oids": [
    {
      "oid": "1.3.6.1.2.1.1.1.0",
      "name": "sysDescr",
      "type": "hex",
      "conversion": "ipv4",
      "tag": true,
      "index_slice": [0, 1],
      "split": " "
    },
    {
      "oid": "1.3.6.1.2.1.2.2.1.6",
      "name": "ifPhysAddress",
      "type": "hex",
      "conversion": "number"
    }
  ],
  "maxConnections": 500,
  "inherited": [
    {
      "oid": "1.3.6.1.2.1.1.5.0",
      "name": "sysName"
    }
  ],
  "extraInfo": {
    "key": "value"
  }
}
```

Refer to the code comments for detailed information on each field and their usage.

## Tools

1. Create Certificates files: `bash make-cert.sh`
2. Send JSON to API to test snmp/get: `bash examples/snmp-get.sh examples/snmp-get.json`

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
