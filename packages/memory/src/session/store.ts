import { Database } from "bun:sqlite";
import * as path from "node:path";
import * as fs from "node:fs";
import type { MessageRecord, SessionRecord } from "../types.js";

function toIso(value: string | number | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  return typeof value === "number" ? new Date(value).toISOString() : value;
}

export class SQLiteSessionStore {
  private db: Database;

  constructor(dbPath: string = path.join(process.cwd(), ".morphic", "sessions.db")) {
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA foreign_keys = ON;");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        tier TEXT,
        provider TEXT,
        model TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        tool_calls TEXT,
        tool_call_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        commit_hash TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);`);

    // Migrate older databases that predate the tier/provider/model columns.
    const columns = this.db.query(`PRAGMA table_info(sessions)`).all() as Array<{ name: string }>;
    const names = new Set(columns.map((c) => c.name));
    for (const column of ["tier", "provider", "model"]) {
      if (!names.has(column)) {
        this.db.run(`ALTER TABLE sessions ADD COLUMN ${column} TEXT`);
      }
    }
  }

  createSession(title: string = "New Session"): SessionRecord {
    return this.saveSession({ title });
  }

  saveSession(session: {
    id?: string;
    title: string;
    createdAt?: string | number;
    updatedAt?: string | number;
    tier?: string;
    provider?: string;
    model?: string;
    status?: "active" | "archived";
  }): SessionRecord {
    const id = session.id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const createdAt = toIso(session.createdAt, now);
    const updatedAt = toIso(session.updatedAt, now);
    const status = session.status || "active";

    this.db
      .query(
        `INSERT INTO sessions (id, title, created_at, updated_at, status, tier, provider, model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           updated_at = excluded.updated_at,
           status = excluded.status,
           tier = excluded.tier,
           provider = excluded.provider,
           model = excluded.model`
      )
      .run(
        id,
        session.title,
        createdAt,
        updatedAt,
        status,
        session.tier ?? null,
        session.provider ?? null,
        session.model ?? null
      );

    return { id, title: session.title, createdAt, updatedAt, status };
  }

  saveMessages(
    sessionId: string,
    messages: Array<{
      id?: string;
      sessionId?: string;
      role: string;
      content?: string | null;
      toolCalls?: any[];
      toolCallId?: string;
      timestamp?: number;
    }>
  ): void {
    for (const msg of messages) {
      this.saveMessage(sessionId, msg.role, msg.content, msg.toolCalls, msg.toolCallId, {
        id: msg.id,
        createdAt: toIso(msg.timestamp, new Date().toISOString()),
      });
    }
  }

  getSession(id: string): SessionRecord | null {
    return this.db
      .query(
        `SELECT id, title, created_at as createdAt, updated_at as updatedAt, status FROM sessions WHERE id = ?`
      )
      .get(id) as SessionRecord | null;
  }

  listSessions(limit: number = 20): SessionRecord[] {
    return this.db
      .query(
        `SELECT id, title, created_at as createdAt, updated_at as updatedAt, status FROM sessions ORDER BY updated_at DESC LIMIT ?`
      )
      .all(limit) as SessionRecord[];
  }

  saveMessage(
    sessionId: string,
    role: string,
    content?: string | null,
    toolCalls?: any[],
    toolCallId?: string,
    options: { id?: string; createdAt?: string } = {}
  ): MessageRecord {
    const id =
      options.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = options.createdAt || new Date().toISOString();
    const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;

    const write = this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO messages (id, session_id, role, content, tool_calls, tool_call_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, sessionId, role, content ?? null, toolCallsJson, toolCallId ?? null, now);

      this.db
        .query(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
        .run(now, sessionId);
    });
    write();

    return {
      id,
      sessionId,
      role,
      content: content ?? null,
      toolCalls: toolCallsJson ?? undefined,
      toolCallId,
      createdAt: now,
    };
  }

  getMessages(sessionId: string): MessageRecord[] {
    return this.db
      .query(
        `SELECT id, session_id as sessionId, role, content, tool_calls as toolCalls, tool_call_id as toolCallId, created_at as createdAt
         FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC`
      )
      .all(sessionId) as MessageRecord[];
  }

  searchMessages(query: string): Array<MessageRecord & { sessionTitle: string }> {
    const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
    return this.db
      .query(
        `SELECT m.id, m.session_id as sessionId, m.role, m.content, m.tool_calls as toolCalls,
                m.tool_call_id as toolCallId, m.created_at as createdAt, s.title as sessionTitle
         FROM messages m
         JOIN sessions s ON m.session_id = s.id
         WHERE m.content LIKE ? ESCAPE '\\'
         ORDER BY m.created_at DESC LIMIT 20`
      )
      .all(`%${escaped}%`) as Array<MessageRecord & { sessionTitle: string }>;
  }

  deleteSession(sessionId: string): void {
    const remove = this.db.transaction(() => {
      this.db.query(`DELETE FROM snapshots WHERE session_id = ?`).run(sessionId);
      this.db.query(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
    });
    remove();
  }

  close(): void {
    this.db.close();
  }
}
