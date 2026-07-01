/**
 * Static catalog of common Vintage Story server console commands, grouped for a
 * command-palette UI. Templates use {placeholder} tokens the frontend fills in
 * before sending. Admins can still freely edit the final command text.
 */

export interface CommandArg {
  /** Token name used in the template, e.g. "player" for {player}. */
  name: string;
  label: string;
  placeholder?: string;
  /** Optional preset suggestions the UI can offer. */
  options?: string[];
  required?: boolean;
}

export interface CommandDef {
  id: string;
  label: string;
  template: string;
  description: string;
  category: string;
  args?: CommandArg[];
}

export const COMMANDS: CommandDef[] = [
  // --- Server ---
  {
    id: "stop",
    label: "Stop server",
    template: "/stop",
    description: "Save the world and shut the server down.",
    category: "Server",
  },
  {
    id: "autosavenow",
    label: "Save now",
    template: "/autosavenow",
    description: "Force an immediate world save.",
    category: "Server",
  },
  {
    id: "genbackup",
    label: "Backup world",
    template: "/genbackup",
    description: "Generate a backup of the current save.",
    category: "Server",
  },
  {
    id: "stats",
    label: "Show stats",
    template: "/stats",
    description: "Print server performance statistics.",
    category: "Server",
  },
  {
    id: "list-clients",
    label: "List players",
    template: "/list clients",
    description: "List currently connected players.",
    category: "Server",
  },
  {
    id: "announce",
    label: "Announce message",
    template: "/announce {message}",
    description: "Broadcast a message to all players.",
    category: "Server",
    args: [{ name: "message", label: "Message", placeholder: "Server restarting soon", required: true }],
  },

  // --- Players ---
  {
    id: "op",
    label: "Grant admin (op)",
    template: "/op {player}",
    description: "Give a player operator privileges.",
    category: "Players",
    args: [{ name: "player", label: "Player", placeholder: "PlayerName", required: true }],
  },
  {
    id: "deop",
    label: "Revoke admin (deop)",
    template: "/deop {player}",
    description: "Remove a player's operator privileges.",
    category: "Players",
    args: [{ name: "player", label: "Player", placeholder: "PlayerName", required: true }],
  },
  {
    id: "kick",
    label: "Kick player",
    template: "/kick {player}",
    description: "Disconnect a player from the server.",
    category: "Players",
    args: [{ name: "player", label: "Player", placeholder: "PlayerName", required: true }],
  },
  {
    id: "ban",
    label: "Ban player",
    template: "/ban {player}",
    description: "Ban a player from the server.",
    category: "Players",
    args: [{ name: "player", label: "Player", placeholder: "PlayerName", required: true }],
  },
  {
    id: "unban",
    label: "Unban player",
    template: "/unban {player}",
    description: "Lift a ban on a player.",
    category: "Players",
    args: [{ name: "player", label: "Player", placeholder: "PlayerName", required: true }],
  },
  {
    id: "gamemode",
    label: "Set player gamemode",
    template: "/gamemode {player} {mode}",
    description: "Change a player's game mode.",
    category: "Players",
    args: [
      { name: "player", label: "Player", placeholder: "PlayerName", required: true },
      {
        name: "mode",
        label: "Mode",
        placeholder: "survival",
        options: ["survival", "creative", "spectator", "guest"],
        required: true,
      },
    ],
  },
  {
    id: "tp",
    label: "Teleport to player",
    template: "/tp {player}",
    description: "Teleport yourself to a player.",
    category: "Players",
    args: [{ name: "player", label: "Player", placeholder: "PlayerName", required: true }],
  },

  // --- World ---
  {
    id: "time-set",
    label: "Set time of day",
    template: "/time set {value}",
    description: "Set the world time (e.g. day, night, 12:00).",
    category: "World",
    args: [
      {
        name: "value",
        label: "Time",
        placeholder: "day",
        options: ["day", "night", "12:00", "6:00", "18:00"],
        required: true,
      },
    ],
  },
  {
    id: "weather-clear",
    label: "Clear weather",
    template: "/weather setprecip 0",
    description: "Stop precipitation.",
    category: "World",
  },
  {
    id: "weather-auto",
    label: "Auto weather",
    template: "/weather setprecipa",
    description: "Return weather control to the game.",
    category: "World",
  },
  {
    id: "calendar-speed",
    label: "Set calendar speed",
    template: "/time calendarspeedmul {value}",
    description: "Adjust how fast in-game time passes.",
    category: "World",
    args: [{ name: "value", label: "Multiplier", placeholder: "0.5", required: true }],
  },
];
