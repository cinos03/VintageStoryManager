import Docker from "dockerode";
import { EventEmitter } from "node:events";
import type { Duplex } from "node:stream";
import { config } from "./config";
import { log } from "./logger";

export type ServerState = "running" | "stopped" | "not-created" | "starting";

export interface ServerStatus {
  state: ServerState;
  version: string | null;
  channel: string | null;
  containerId: string | null;
  startedAt: string | null;
}

const MAX_BUFFER_BYTES = 256 * 1024;

/**
 * Controls a single Vintage Story dedicated-server container via the Docker API.
 * Streams the server console (stdout/stderr) and forwards typed commands to stdin.
 */
class DockerManager extends EventEmitter {
  private docker = new Docker();
  private attachStream: Duplex | null = null;
  private outputBuffer: Buffer[] = [];
  private outputBytes = 0;

  private getContainer(): Docker.Container {
    return this.docker.getContainer(config.vs.containerName);
  }

  /** Reconnect to an already-running container after a manager restart. */
  async init(): Promise<void> {
    try {
      const info = await this.getContainer().inspect();
      if (info.State.Running) {
        log.info("Found running game container; re-attaching console.");
        await this.attachConsole();
      }
    } catch {
      /* container does not exist yet */
    }
  }

  async status(): Promise<ServerStatus> {
    try {
      const info = await this.getContainer().inspect();
      const env = info.Config.Env ?? [];
      const version = this.readEnv(env, "VS_VERSION");
      const channel = this.readEnv(env, "VS_CHANNEL");
      return {
        state: info.State.Running ? "running" : "stopped",
        version,
        channel,
        containerId: info.Id.slice(0, 12),
        startedAt: info.State.Running ? info.State.StartedAt : null,
      };
    } catch {
      return { state: "not-created", version: null, channel: null, containerId: null, startedAt: null };
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
      log.info("Removed existing game container.");
    } catch {
      /* nothing to remove */
    }
  }

  /** (Re)creates and starts the game container for the requested version. */
  async start(version: string, channel: string): Promise<void> {
    if (!config.hostDataDir || !config.hostGameDir) {
      throw new Error(
        "HOST_DATA_DIR and HOST_GAME_DIR must be set so the game container can be given host bind mounts."
      );
    }

    const current = await this.status();
    // If it's already running the requested version, do nothing.
    if (current.state === "running" && current.version === version && current.channel === channel) {
      return;
    }
    // Recreate so version/channel changes take effect cleanly.
    await this.removeIfExists();
    this.resetBuffer();

    const gamePort = `${config.vs.gamePort}`;
    const createOptions: Docker.ContainerCreateOptions = {
      name: config.vs.containerName,
      Image: config.vs.image,
      Hostname: config.vs.containerName,
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
        Binds: [`${config.hostDataDir}:/data`, `${config.hostGameDir}:/game`],
        PortBindings: {
          [`${gamePort}/tcp`]: [{ HostPort: gamePort }],
          [`${gamePort}/udp`]: [{ HostPort: gamePort }],
        },
        RestartPolicy: { Name: "no" },
        NetworkMode: config.vs.network || undefined,
      },
    };

    log.info(`Creating game container for version ${version} (${channel})...`);
    const container = await this.docker.createContainer(createOptions);

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
    log.info("Game container started.");
    this.emit("status");
  }

  async stop(): Promise<void> {
    const current = await this.status();
    if (current.state !== "running") return;
    // Ask the server to save & shut down gracefully first.
    try {
      this.writeToStream("/stop\n");
    } catch {
      /* stream may be gone */
    }
    try {
      await this.getContainer().stop({ t: 25 });
    } catch (err) {
      log.warn("Graceful stop failed, forcing:", err);
      await this.getContainer().kill().catch(() => undefined);
    }
    this.detachStream();
    this.emit("status");
  }

  async restart(): Promise<void> {
    const current = await this.status();
    const version = current.version ?? config.vs.defaultVersion;
    const channel = current.channel ?? config.vs.defaultChannel;
    await this.stop();
    await this.start(version, channel);
  }

  private async attachConsole(): Promise<void> {
    const container = this.getContainer();
    const stream = (await container.attach({
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
    stream.on("error", (err) => log.warn("Console stream error:", err));
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
    this.emit("data", chunk);
  }

  private resetBuffer(): void {
    this.outputBuffer = [];
    this.outputBytes = 0;
  }

  /** Recent console output, for hydrating a newly connected terminal. */
  getBufferedOutput(): Buffer {
    return Buffer.concat(this.outputBuffer);
  }
}

export const dockerManager = new DockerManager();
