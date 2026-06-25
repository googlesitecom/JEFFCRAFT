// PeerJS P2P multiplayer — no server needed (uses free PeerJS cloud broker).
// Host: creates a Peer with a random ID (the "code" players use to join).
// Client: connects to that ID, receives world data + player position updates.
import Peer, { DataConnection } from "peerjs";
import * as THREE from "three";

export type MultiplayerRole = "host" | "client" | null;

export interface RemotePlayerState {
  id: string;
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  // Last seen timestamp for timeout
  lastSeen: number;
}

export type MultiplayerMessage =
  | { kind: "world-seed"; seed: number; name: string; mode: string }
  | { kind: "player-state"; x: number; y: number; z: number; yaw: number; pitch: number }
  | { kind: "block-place"; x: number; y: number; z: number; blockType: number }
  | { kind: "block-break"; x: number; y: number; z: number }
  | { kind: "chat"; text: string; from: string }
  | { kind: "player-joined"; id: string }
  | { kind: "player-left"; id: string };

export class MultiplayerManager {
  peer: Peer | null = null;
  role: MultiplayerRole = null;
  // Code used to identify the host (random 6-char string)
  shareCode: string = "";
  // For host: connections to each client
  hostConnections: Map<string, DataConnection> = new Map();
  // For client: connection to host
  clientConnection: DataConnection | null = null;
  // Remote players (positions, rotations) — keyed by their peer ID
  remotePlayers: Map<string, RemotePlayerState> = new Map();
  // Local player ID (for sending updates)
  localId: string = "";
  // Callbacks
  onMessage: ((msg: MultiplayerMessage) => void) | null = null;
  onPlayerJoined: ((id: string) => void) | null = null;
  onPlayerLeft: ((id: string) => void) | null = null;
  onConnected: (() => void) | null = null;
  onError: ((err: string) => void) | null = null;
  onStatusChange: ((status: string) => void) | null = null;

  // Generate a 6-character alphanumeric code (no confusing chars: 0/O/1/I)
  private genCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // === HOST MODE ===
  hostWorld(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect();
      this.role = "host";
      this.shareCode = this.genCode();
      this.onStatusChange?.(`Creando mundo... código: ${this.shareCode}`);

      // Use a known prefix to avoid collisions with other apps on the public broker
      const peerId = `jeffcraft-host-${this.shareCode}`;
      this.peer = new Peer(peerId, { debug: 1 });

      this.peer.on("open", (id: string) => {
        this.localId = id;
        this.onStatusChange?.(`Mundo abierto. Comparte el código: ${this.shareCode}`);
        this.onConnected?.();
        resolve();
      });

      this.peer.on("connection", (conn: DataConnection) => {
        // A client is connecting
        const clientId = conn.peer;
        this.hostConnections.set(clientId, conn);
        this.onStatusChange?.(`Jugador conectándose: ${clientId}`);

        conn.on("open", () => {
          this.onStatusChange?.(`Jugador conectado: ${clientId}`);
          this.onPlayerJoined?.(clientId);
          // Notify existing players about the new one
          this.broadcast({ kind: "player-joined", id: clientId }, clientId);
        });

        conn.on("data", (data: any) => {
          this.handleIncoming(data as MultiplayerMessage, clientId);
        });

        conn.on("close", () => {
          this.hostConnections.delete(clientId);
          this.remotePlayers.delete(clientId);
          this.onPlayerLeft?.(clientId);
          this.broadcast({ kind: "player-left", id: clientId });
          this.onStatusChange?.(`Jugador desconectado: ${clientId}`);
        });

        conn.on("error", (err: any) => {
          console.warn("Host conn error:", err);
          this.hostConnections.delete(clientId);
        });
      });

      this.peer.on("error", (err: any) => {
        console.error("Peer host error:", err);
        const msg = err?.type === "unavailable-id"
          ? `El código ${this.shareCode} ya está en uso. Intenta de nuevo.`
          : `Error: ${err?.message || err?.type || "desconocido"}`;
        this.onError?.(msg);
        reject(err);
      });
    });
  }

  // === CLIENT MODE ===
  joinWorld(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect();
      this.role = "client";
      this.shareCode = code.toUpperCase().trim();
      this.onStatusChange?.(`Conectando a ${this.shareCode}...`);

      // Client uses a random ID
      this.peer = new Peer({ debug: 1 });

      this.peer.on("open", (id: string) => {
        this.localId = id;
        const hostId = `jeffcraft-host-${this.shareCode}`;
        const conn = this.peer!.connect(hostId, { reliable: true });

        conn.on("open", () => {
          this.clientConnection = conn;
          this.onStatusChange?.(`Conectado al mundo ${this.shareCode}`);
          this.onConnected?.();
          resolve();
        });

        conn.on("data", (data: any) => {
          this.handleIncoming(data as MultiplayerMessage, "host");
        });

        conn.on("close", () => {
          this.onStatusChange?.("Desconectado del host");
          this.onPlayerLeft?.("host");
        });

        conn.on("error", (err: any) => {
          console.error("Client conn error:", err);
          this.onError?.(`Error de conexión: ${err?.message || "no se pudo conectar"}`);
          reject(err);
        });
      });

      this.peer.on("error", (err: any) => {
        console.error("Peer client error:", err);
        const msg = err?.type === "peer-unavailable"
          ? `No se encontró un mundo con el código ${this.shareCode}. Verifica que el código sea correcto y que el host tenga el mundo abierto.`
          : `Error: ${err?.message || err?.type || "desconocido"}`;
        this.onError?.(msg);
        reject(err);
      });
    });
  }

  // === SEND HELPERS ===
  // Send player state to all peers (host: broadcast to clients, client: send to host)
  sendPlayerState(pos: THREE.Vector3, yaw: number, pitch: number) {
    const msg: MultiplayerMessage = {
      kind: "player-state",
      x: pos.x, y: pos.y, z: pos.z,
      yaw, pitch,
    };
    if (this.role === "host") {
      this.broadcast(msg);
    } else if (this.clientConnection) {
      this.send(this.clientConnection, msg);
    }
  }

  sendBlockPlace(x: number, y: number, z: number, blockType: number) {
    const msg: MultiplayerMessage = { kind: "block-place", x, y, z, blockType };
    if (this.role === "host") this.broadcast(msg);
    else if (this.clientConnection) this.send(this.clientConnection, msg);
  }

  sendBlockBreak(x: number, y: number, z: number) {
    const msg: MultiplayerMessage = { kind: "block-break", x, y, z };
    if (this.role === "host") this.broadcast(msg);
    else if (this.clientConnection) this.send(this.clientConnection, msg);
  }

  sendChat(text: string) {
    const msg: MultiplayerMessage = { kind: "chat", text, from: this.localId };
    if (this.role === "host") this.broadcast(msg);
    else if (this.clientConnection) this.send(this.clientConnection, msg);
  }

  // Host: send world seed to a newly connected client
  sendWorldSeed(conn: DataConnection, seed: number, name: string, mode: string) {
    const msg: MultiplayerMessage = { kind: "world-seed", seed, name, mode };
    this.send(conn, msg);
  }

  // === INTERNAL ===
  private send(conn: DataConnection, msg: MultiplayerMessage) {
    try {
      if (conn.open) conn.send(msg);
    } catch (e) {
      console.warn("Send failed:", e);
    }
  }

  private broadcast(msg: MultiplayerMessage, exceptId?: string) {
    for (const [id, conn] of this.hostConnections) {
      if (id !== exceptId) this.send(conn, msg);
    }
  }

  private handleIncoming(msg: MultiplayerMessage, fromId: string) {
    if (msg.kind === "player-state") {
      // Update or create remote player
      const existing = this.remotePlayers.get(fromId);
      if (existing) {
        existing.position.set(msg.x, msg.y, msg.z);
        existing.yaw = msg.yaw;
        existing.pitch = msg.pitch;
        existing.lastSeen = Date.now();
      } else {
        this.remotePlayers.set(fromId, {
          id: fromId,
          position: new THREE.Vector3(msg.x, msg.y, msg.z),
          yaw: msg.yaw,
          pitch: msg.pitch,
          lastSeen: Date.now(),
        });
        // Notify local player that a new remote player appeared
        this.onPlayerJoined?.(fromId);
      }
      // Host: rebroadcast this client's position to all OTHER clients
      // (so clients can see each other, not just the host)
      if (this.role === "host" && fromId !== "host") {
        this.broadcast(msg, fromId);
      }
    } else if (msg.kind === "player-joined") {
      this.onPlayerJoined?.(msg.id);
    } else if (msg.kind === "player-left") {
      this.remotePlayers.delete(msg.id);
      this.onPlayerLeft?.(msg.id);
    } else {
      // Other messages (world-seed, block-place, block-break, chat)
      // Host: rebroadcast block-place/break/chat to all OTHER clients (relay)
      if (this.role === "host" && fromId !== "host" &&
          (msg.kind === "block-place" || msg.kind === "block-break" || msg.kind === "chat")) {
        this.broadcast(msg, fromId);
      }
      this.onMessage?.(msg);
    }
  }

  // Clean up remote players that haven't been seen in 10 seconds
  pruneStalePlayers() {
    const now = Date.now();
    for (const [id, p] of this.remotePlayers) {
      if (now - p.lastSeen > 10000) {
        this.remotePlayers.delete(id);
        this.onPlayerLeft?.(id);
      }
    }
  }

  disconnect() {
    if (this.clientConnection) {
      try { this.clientConnection.close(); } catch {}
      this.clientConnection = null;
    }
    for (const conn of this.hostConnections.values()) {
      try { conn.close(); } catch {}
    }
    this.hostConnections.clear();
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }
    this.role = null;
    this.shareCode = "";
    this.remotePlayers.clear();
    this.localId = "";
    this.onStatusChange?.("Desconectado");
  }

  isConnected(): boolean {
    return this.peer !== null && this.role !== null;
  }
}
