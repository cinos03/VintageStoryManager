import Docker from "dockerode";
import { EventEmitter } from "node:events";
import type { Duplex } from "node:stream";
import { config } from "./config";
import { log } from "./logger";
import type { ServerConfig } from "./db";

export type ServerState = "running" | "stopped" | "not-created" | "starting";

export interface ServerStatus {
  state: ServerState;
  version: string | null;
  channel: string | null;
  containerId: string | null;
  startedAt: string | null;
  /** Live player info derived from the console stream. */
  players: {
    online: number;
    peak: number;
    names: string[];
  };
}

const MAX_BUFFER_BYTES = 256 * 1024;
const docker = new Docker();

/**
 * Controls a single Vintage Story dedicated-server container via the Docker API.
 * Streams the server console (stdout/stderr) and forwards typed commands to stdin.
 * One instance exists per managed server.
 */
export class ServerRunner extends EventEmitter {
  readonly id: string;
  private containerName: string;
  private attachStream: Duplex | null = null;
  private outputBuffer: Buffer[] = [];
  private outputBytes = 0;
  // Live player tracking, parsed from console join/leave events.
  private online = new Set<string>();
  private peakPlayers = 0;
  private lineTail = "";

  constructor(server: ServerConfig) {
    super();
    this.id = server.id;
    this.containerName = server.containerName;
  }

  private getContainer(): Docker.Container {
    return docker.getContainer(this.containerName);
  }

  /** Reconnect to an already-running container after a manager restart. */
  async init(): Promise<void> {
    try {
      const info = await this.getContainer().inspect();
      if (info.State.Running) {
        log.info(`[${this.id}] Found running container; re-attaching console.`);
        await this.attachConsole();
      }
    } catch {
      /* container does not exist yet */
    }
  }

  async status(): Promise<ServerStatus> {
    const players = {
      online: this.online.size,
      peak: this.peakPlayers,
      names: [...this.online],
    };
    try {
      const info = await this.getContainer().inspect();
      const env = info.Config.Env ?? [];
      const running = info.State.Running;
      if (!running) this.resetPlayers();
      return {
        state: running ? "running" : "stopped",
        version: this.readEnv(env, "VS_VERSION"),
        channel: this.readEnv(env, "VS_CHANNEL"),
        containerId: info.Id.slice(0, 12),
        startedAt: running ? info.State.StartedAt : null,
        players: running ? players : { online: 0, peak: 0, names: [] },
      };
    } catch {
      return {
        state: "not-created",
        version: null,
        channel: null,
        containerId: null,
        startedAt: null,
        players: { online: 0, peak: 0, names: [] },
      };
    }
  }

  private readEnv(env: string[], key: string): string | null {
    const entry = env.find((e) => e.startsWith(`${key}=`));
    return entry ? entry.slice(key.length + 1) : null;
  }

  private async removeIfExists(): Promise<void> {
    try {
      const container = this.getContainer();
      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop({ t: 20 }).catch(() => undefined);
      }
      await container.remove({ force: true });
      log.info(`[${this.id}] Removed existing container.`);
    } catch {
      /* nothing to remove */
    }
  }

  /** (Re)creates and starts the game container for the requested version. */
  async start(server: ServerConfig, version: string, channel: string): Promise<void> {
    if (!server.hostDataDir || !config.hostGameDir) {
      throw new Error(
        "HOST_DATA_DIR and HOST_GAME_DIR must be set so the game container can be given host bind mounts."
      );
    }
    this.containerName = server.containerName;

    const current = await this.status();
    if (current.state === "running" && current.version === version && current.channel === channel) {
      return;
    }
    await this.removeIfExists();
    this.resetBuffer();

    const gamePort = `${server.gamePort}`;
    const createOptions: Docker.ContainerCreateOptions = {
      name: server.containerName,
      Image: config.vs.image,
      Hostname: server.containerName,
      Env: [`VS_VERSION=${version}`, `VS_CHANNEL=${channel}`],
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      ExposedPorts: {
        [`${gamePort}/tcp`]: {},
        [`${gamePort}/udp`]: {},
      },
      HostConfig: {
        Binds: [`${server.hostDataDir}:/data`, `${config.hostGameDir}:/game`],
        PortBindings: {
          [`${gamePort}/tcp`]: [{ HostPort: gamePort }],
          [`${gamePort}/udp`]: [{ HostPort: gamePort }],
        },
        RestartPolicy: { Name: "no" },
        NetworkMode: config.vs.network || undefined,
      },
    };

    log.info(`[${this.id}] Creating container for version ${version} (${channel}) on port ${gamePort}...`);
    const container = await docker.createContainer(createOptions);

    // Attach before start so we capture the full boot log.
    const stream = (await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true,
    })) as unknown as Duplex;
    this.bindStream(stream);

    await container.start();
    log.info(`[${this.id}] Container started.`);
    this.emit("status");
  }

  async stop(): Promise<void> {
    const current = await this.status();
    if (current.state !== "running") return;
    try {
      this.writeToStream("/stop\n");
    } catch {
      /* stream may be gone */
    }
    try {
      await this.getContainer().stop({ t: 25 });
    } catch (err) {
      log.warn(`[${this.id}] Graceful stop failed, forcing:`, err);
      await this.getContainer().kill().catch(() => undefined);
    }
    this.detachStream();
    this.emit("status");
  }

  async restart(server: ServerConfig): Promise<void> {
    const current = await this.status();
    const version = current.version ?? server.version;
    const channel = current.channel ?? server.channel;
    await this.stop();
    await this.start(server, version, channel);
  }

  /** Stops and removes the container (used when deleting a server). */
  async destroy(): Promise<void> {
    await this.removeIfExists();
    this.detachStream();
    this.resetBuffer();
  }

  private async attachConsole(): Promise<void> {
    const stream = (await this.getContainer().attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true,
    })) as unknown as Duplex;
    this.bindStream(stream);
  }

  private bindStream(stream: Duplex): void {
    this.detachStream();
    this.attachStream = stream;
    stream.on("data", (chunk: Buffer) => this.pushOutput(chunk));
    stream.on("error", (err) => log.warn(`[${this.id}] Console stream error:`, err));
    stream.on("end", () => {
      this.attachStream = null;
      this.emit("status");
    });
  }

  private detachStream(): void {
    if (this.attachStream) {
      this.attachStream.removeAllListeners("data");
      try {
        this.attachStream.end();
      } catch {
        /* ignore */
      }
      this.attachStream = null;
    }
  }

  /** Sends a console command to the running server (newline appended). */
  sendCommand(command: string): void {
    if (!this.attachStream) throw new Error("Server is not running.");
    const line = command.endsWith("\n") ? command : `${command}\n`;
    this.writeToStream(line);
  }

  private writeToStream(data: string): void {
    if (!this.attachStream) throw new Error("Server is not running.");
    this.attachStream.write(data);
  }

  private pushOutput(chunk: Buffer): void {
    this.outputBuffer.push(chunk);
    this.outputBytes += chunk.length;
    while (this.outputBytes > MAX_BUFFER_BYTES && this.outputBuffer.length > 1) {
      const removed = this.outputBuffer.shift();
      if (removed) this.outputBytes -= removed.length;
    }
    this.parsePlayers(chunk.toString("utf8"));
    this.emit("data", chunk);
  }

  /**
   * Parse player join/leave lines from the console stream to keep a live count.
   * VS server logs e.g. "... Player Bob joins." and "... Player Bob left.".
   */
  private parsePlayers(text: string): void {
    this.lineTail += text;
    const lines = this.lineTail.split(/\r?\n/);
    // Keep the last partial line for the next chunk.
    this.lineTail = lines.pop() ?? "";
    let changed = false;
    for (const line of lines) {
      const join = line.match(/\bPlayer\s+(\S+?)\s+.*\bjoins?\b/i) ?? line.match(/\bPlayer\s+(\S+)\s+joins?\b/i);
      const leave =
        line.match(/\bPlayer\s+(\S+?)\s+.*\b(?:left|disconnected)\b/i) ??
        line.match(/\bPlayer\s+(\S+)\s+(?:left|disconnected)\b/i);
      if (join) {
        const name = join[1].replace(/[.,]$/, "");
        if (!this.online.has(name)) {
          this.online.add(name);
          if (this.online.size > this.peakPlayers) this.peakPlayers = this.online.size;
          changed = true;
        }
      } else if (leave) {
        const name = leave[1].replace(/[.,]$/, "");
        if (this.online.delete(name)) changed = true;
      }
    }
    if (changed) this.emit("status");
  }

  private resetPlayers(): void {
    this.online.clear();
    this.peakPlayers = 0;
    this.lineTail = "";
  }

  private resetBuffer(): void {
    this.outputBuffer = [];
    this.outputBytes = 0;
    this.resetPlayers();
  }

  /** Recent console output, for hydrating a newly connected terminal. */
  getBufferedOutput(): Buffer {
    return Buffer.concat(this.outputBuffer);
  }
}

/** Owns one ServerRunner per managed server, keyed by server id. */
class ServerRegistry {
  private runners = new Map<string, ServerRunner>();

  get(server: ServerConfig): ServerRunner {
    let runner = this.runners.get(server.id);
    if (!runner) {
      runner = new ServerRunner(server);
      this.runners.set(server.id, runner);
    }
    return runner;
  }

  /** Existing runner by id (no creation) — used by the WebSocket layer. */
  peek(id: string): ServerRunner | undefined {
    return this.runners.get(id);
  }

  async initAll(servers: ServerConfig[]): Promise<void> {
    for (const server of servers) {
      await this.get(server).init();
    }
  }

  async remove(server: ServerConfig): Promise<void> {
    const runner = this.get(server);
    await runner.destroy();
    runner.removeAllListeners();
    this.runners.delete(server.id);
  }
}

export const registry = new ServerRegistry();

