# homebridge-ha-sync

[![npm version](https://img.shields.io/npm/v/homebridge-ha-sync.svg)](https://www.npmjs.com/package/homebridge-ha-sync)
[![CI](https://github.com/juangcarmona/homebridge-ha-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/juangcarmona/homebridge-ha-sync/actions/workflows/ci.yml)

Bidirectional state synchronisation between [Homebridge](https://homebridge.io) and [Home Assistant](https://www.home-assistant.io).

---

## What it does

`homebridge-ha-sync` keeps Homebridge and Home Assistant in sync automatically. In the outbound direction it tails the Homebridge log file in real time, parses accessory state-change events (e.g. a blind reaching its final position), debounces rapid intermediate updates, and forwards the settled value to Home Assistant via the REST API. In the inbound direction it runs a lightweight HTTP server that accepts webhook calls from Home Assistant automations and applies the new value directly to the matching Homebridge accessory — so a change made in the HA dashboard or an HA automation is immediately visible in HomeKit too.

---

## Installation

### Via Homebridge UI (recommended)

Search for **homebridge-ha-sync** in the Homebridge plugin search and click **Install**.

### Via npm

```bash
npm install -g homebridge-ha-sync
```

After installing, restart Homebridge and configure the plugin through the Homebridge UI or by editing `config.json` directly.

---

## Configuration

All fields are set through the Homebridge UI or in the `platforms` array of your `config.json`.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `haUrl` | string | ✅ | — | Base URL of your Home Assistant instance, e.g. `http://homeassistant.local:8123` |
| `haToken` | string | ✅ | — | Long-Lived Access Token generated in HA (Profile → Long-Lived Access Tokens) |
| `logFilePath` | string | ✅ | — | Absolute path to the Homebridge log file, e.g. `/var/lib/homebridge/homebridge.log` |
| `webhookPort` | integer | ✅ | — | TCP port this plugin listens on for inbound webhooks from Home Assistant |
| `debounceMs` | integer | ❌ | `1500` | Quiet-period in ms after the last position update before forwarding to HA. Prevents flooding during blind movement. |
| `stateCachePath` | string | ❌ | — | Path to persist last-known positions across restarts, e.g. `/var/lib/homebridge/ha-sync-state.json`. Avoids duplicate POSTs after a plugin restart. |
| `accessoryMappings` | array | ❌ | `[]` | List of `{ homebridgeName, entityId }` pairs. See [Accessory Mapping format](#accessory-mapping-format). |

### Example `config.json` block

```json
{
  "platform": "HomebridgeHaSync",
  "name": "HomebridgeHaSync",
  "haUrl": "http://192.168.1.100:8123",
  "haToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.FAKE_TOKEN_DO_NOT_USE",
  "logFilePath": "/var/lib/homebridge/homebridge.log",
  "webhookPort": 3001,
  "debounceMs": 1500,
  "stateCachePath": "/var/lib/homebridge/ha-sync-state.json",
  "accessoryMappings": [
    { "homebridgeName": "Blinds 7",  "entityId": "cover.blinds_7"  },
    { "homebridgeName": "Blinds 12", "entityId": "cover.blinds_12" },
    { "homebridgeName": "Office Blind", "entityId": "cover.office_blind" }
  ]
}
```

---

## Accessory Mapping format

Each entry in `accessoryMappings` pairs a Homebridge accessory name to a Home Assistant entity ID:

```json
{ "homebridgeName": "Blinds 7", "entityId": "cover.blinds_7" }
```

**`homebridgeName` must match exactly the name that appears in the Homebridge log.** You can confirm the exact name by checking a live log line:

```
[2024-01-15 10:23:45] [Broadlink RM] Blinds 7 setCurrentPosition: 75
                                      ^^^^^^^^
                                      this is homebridgeName
```

The match is case-sensitive and space-sensitive. If the name in your config does not match the log exactly, outbound events for that accessory will be silently discarded.

---

## Home Assistant setup

### Inbound webhook — push HA state changes to Homebridge

Create an automation in Home Assistant that POSTs to the plugin's webhook whenever a cover entity changes state:

```yaml
alias: Sync cover.blinds_7 → Homebridge
description: Push blind position from HA to Homebridge via homebridge-ha-sync
trigger:
  - platform: state
    entity_id: cover.blinds_7
    attribute: current_position
condition: []
action:
  - service: rest_command.homebridge_ha_sync_webhook
    data:
      accessoryName: "Blinds 7"
      value: "{{ state_attr('cover.blinds_7', 'current_position') }}"
mode: single
```

Add the matching `rest_command` to your HA `configuration.yaml` (replace the IP and port with your Homebridge host and configured `webhookPort`):

```yaml
rest_command:
  homebridge_ha_sync_webhook:
    url: "http://192.168.1.50:3001/webhook"
    method: POST
    headers:
      Content-Type: application/json
    payload: '{"accessoryName": "{{ accessoryName }}", "value": {{ value }}}'
```

---

## Extensibility — adding a new parser

The plugin discovers parsers automatically from the `src/parsers/` directory. To support a new accessory type:

1. Create a new file in `src/parsers/`, e.g. `src/parsers/SwitchParser.ts`.
2. Implement the `LogParser` interface exported from the plugin's main entry point:

```typescript
import { LogParser, StateChangeEvent } from 'homebridge-ha-sync';

export default class SwitchParser implements LogParser {
  canParse(line: string): boolean {
    return line.includes('[My Switch Plugin]') && line.includes('setState');
  }

  parse(line: string): StateChangeEvent | null {
    const match = line.match(/\[My Switch Plugin\] (.+?) setState: (on|off)/);
    if (!match) return null;
    return {
      accessoryName: match[1],
      value: match[2] === 'on' ? 1 : 0,
      timestamp: Date.now(),
    };
  }
}
```

3. Rebuild the plugin (`npm run build`). No other files need to be modified — the `ParserRegistry` picks up the new file automatically on the next startup.

---

## How it works

```
Homebridge log file
        │  (kernel fs event, < 10 ms)
        ▼
    LogTailer
        │  raw line
        ▼
  ParserRegistry  ──► first matching LogParser ──► StateChangeEvent
        │
        ▼
    Debouncer  (per-accessory timer, default 1500 ms)
        │  settled event
        ▼
OutboundDispatcher ──► dedup + feedback-loop check ──► POST /api/states/<entity_id>
                                                              (Home Assistant REST API)

Home Assistant
        │  POST /webhook  { accessoryName, value }
        ▼
InboundWebhookServer ──► origin tracking write ──► update Homebridge characteristic
```

A key invariant: a state change that originates in Home Assistant is recorded in an in-memory origin tracker. If that same value is subsequently seen in the Homebridge log (because HB applied the change and logged it), the `OutboundDispatcher` recognises it as an inbound-origin event and suppresses the echo POST to HA — preventing an infinite feedback loop.

---

## Contributing

Pull requests are welcome. Please open an issue first to discuss significant changes.

1. Fork the repo and create a feature branch.
2. Run `npm test` to make sure existing tests pass.
3. Add tests for any new behaviour.
4. Submit a PR against `main`.

---

## License

[MIT](LICENSE)
