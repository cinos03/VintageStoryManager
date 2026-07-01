# Vintage Story Server Manager

A self-hosted web GUI for running a Vintage Story dedicated server in Docker.
It runs as a small manager container that controls a separate `vs-server`
container through the Docker API, so you can switch game versions, install mods,
and use the live server console from your browser.

## Features

- **Choose what version to run** — pulls the official version list from
  `api.vintagestory.at`; the game files are downloaded on demand.
- **Browse & install mods** — search the official
  [mods.vintagestory.at](https://mods.vintagestory.at) database and install with
  one click (version-aware release selection).
- **Import mods** — upload a `.zip` / `.cs` / `.dll` mod file from the web UI.
- **Start / stop / restart** the server.
- **Live terminal** — streaming server console over WebSocket.
- **Run commands** — type console commands directly into the terminal.
- **Current mods** — lists everything installed, read from each mod's `modinfo.json`.

## Architecture

```
┌──────────────────────┐        Docker API        ┌─────────────────────┐
│  manager (this app)  │ ───────────────────────▶ │  vs-server          │
│  Express + React     │  create / start / stop   │  dotnet VS server   │
│  :8080 web UI        │  attach stdin/stdout     │  :42420 game port   │
└──────────┬───────────┘                          └─────────┬───────────┘
           │ shared bind mount (/data)                      │
           └────────────────────  Mods, worlds, config  ────┘
```

- The **manager** never bundles the game. It creates the `vs-server` container,
  which downloads the requested Vintage Story version into a persistent volume
  at runtime — so version switching needs no image rebuild.
- Both containers share the data directory, letting the manager manage the
  `Mods` folder directly while the server reads/writes worlds and config.

## Prerequisites (on the Ubuntu host)

- Docker Engine + the Compose plugin.
- Two host directories the containers will share:

```bash
sudo mkdir -p /opt/vsmanager/data /opt/vsmanager/versions
sudo chown -R $USER:$USER /opt/vsmanager
```

## Deploy

1. Copy this project to the server, e.g. `/opt/vsmanager/app`.
2. Create a `.env` from the example and edit the secrets:

   ```bash
   cp .env.example .env
   # set JWT_SECRET, ADMIN_PASSWORD, and confirm HOST_DATA_DIR / HOST_GAME_DIR
   ```

   > `HOST_DATA_DIR` and `HOST_GAME_DIR` must be **absolute paths on the Docker
   > host** (they are used as bind mounts for the game container). They should
   > match the directories created above.

3. Build both images (the manager and the on-demand vs-server image):

   ```bash
   docker compose --profile build-only build
   ```

4. Start the manager:

   ```bash
   docker compose up -d manager
   ```

5. Open `http://<server-ip>:8080` and log in with `ADMIN_USER` /
   `ADMIN_PASSWORD`. Pick a version and click **Start**.

The game port `42420/tcp+udp` is published on the host by the manager when it
starts the server, so players connect to `<server-ip>:42420`.

## Configuration (`.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `MANAGER_PORT` | `8080` | Web UI / API port. |
| `JWT_SECRET` | — | Secret for signing login tokens. **Change this.** |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / `changeme` | Seeds the first login. |
| `VS_VERSION` | `1.22.3` | Default game version. |
| `VS_CHANNEL` | `stable` | `stable` or `unstable`. |
| `HOST_DATA_DIR` | `/opt/vsmanager/data` | Host path for worlds/config/mods. |
| `HOST_GAME_DIR` | `/opt/vsmanager/versions` | Host path for downloaded game files. |

The admin password can be changed from the API after first login; the seed
values only apply when no user exists yet.

## Development

```bash
# backend (http://localhost:8080)
cd server && npm install && npm run dev

# frontend (http://localhost:5173, proxies /api and /ws to :8080)
cd web && npm install && npm run dev
```

Local development still needs a reachable Docker socket for the server-control
features to work.

## Security notes

- Access is protected by a username/password login (bcrypt-hashed) with a JWT in
  an httpOnly cookie. Put it behind a reverse proxy with TLS if exposing beyond
  your LAN.
- The manager mounts the Docker socket, which grants host-level control — only
  run it on a trusted host.
