// Shapes of the Firestore documents, shared by the web app and the API.
// Collections:
//   users/{uid}           profile + role, one per Firebase Auth user
//   workspaces/{uid}      a trainer's whole business (DB as JSON), keyed by their uid
//   activity/{auto}       audit log entries
//   invites/{token}       one-time sign-up / password-reset links (doc id is the secret)
//   portalLinks/{token}   client portal links (doc id is the secret)
//   meta/setup            marks that the owner account exists

export type Role = 'owner' | 'trainer';

export interface UserDoc {
  name: string;
  email: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
  lastSeenAt?: string;
}

export interface WorkspaceDoc {
  /** JSON-encoded DB. */
  data: string;
  version: number;
  updatedAt: unknown;
  /** uid of the last writer, or "portal:<clientId>". */
  updatedBy: string;
}

export interface ActivityDoc {
  workspaceId: string;
  actorUid: string;
  actorName: string;
  actorRole: Role | 'client';
  message: string;
  createdAt: unknown;
}

export type InviteKind = 'invite' | 'reset';

export interface InviteDoc {
  kind: InviteKind;
  name: string;
  email: string;
  /** For password resets: whose password. */
  userId: string | null;
  createdBy: string;
  createdAt: unknown;
  expiresAt: unknown;
  used: boolean;
}

export interface PortalLinkDoc {
  workspaceId: string;
  clientId: string;
  createdAt: unknown;
  revoked: boolean;
}

/** Firestore caps a document at 1 MiB; leave room for the other fields. */
export const MAX_WORKSPACE_BYTES = 1_000_000;
export const INVITE_DAYS = 14;
