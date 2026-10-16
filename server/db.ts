import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Role = 'owner' | 'trainer';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  created_at: string;
  disabled_at: string | null;
  last_seen_at: string | null;
}

export interface WorkspaceRow {
  id: string;
  user_id: string;
  data: string;
  version: number;
  updated_at: string;
}

export type InviteKind = 'setup' | 'invite' | 'reset';

export interface InviteRow {
  token: string;
  kind: InviteKind;
  name: string;
  email: string;
  user_id: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

export interface ActivityRow {
  id: number;
  workspace_id: string;
  actor_name: string;
  actor_role: string;
  message: string;
  created_at: string;
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'trainer')),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      disabled_at TEXT,
      last_seen_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_ws ON activity(workspace_id, id);
    CREATE TABLE IF NOT EXISTS portal_links (
      token TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
  `);
  return db;
}
