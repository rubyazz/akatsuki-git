/**
 * Akatsuki Git shared protocol — TypeScript mirror.
 *
 * This file is a **hand-mirrored** copy of `shared/src/lib.rs` (Rust).
 * The Rust crate is the source of truth. When you change the Rust types you
 * MUST:
 *   1. Update this file to match.
 *   2. Bump `PROTOCOL_VERSION` if the change is breaking.
 *   3. The backend refuses mismatched versions at handshake.
 *
 * Replacing this mirror with `ts-rs` codegen is tracked in `docs/ROADMAP.md`.
 */

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 framing
// ---------------------------------------------------------------------------

export type RpcId = number | string;

export interface RpcRequest {
    jsonrpc: "2.0";
    /** Omitted for notifications. */
    id?: RpcId;
    method: string;
    params?: unknown;
}

export interface RpcError {
    code: number;
    message: string;
    data?: unknown;
}

export interface RpcResponse<T = unknown> {
    jsonrpc: "2.0";
    id?: RpcId;
    result?: T;
    error?: RpcError;
}

export const ErrorCodes = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    PROTOCOL_VERSION_MISMATCH: 1,
    GIT_ERROR: 2,
    STORAGE_ERROR: 3,
    INVALID_PATH: 4,
} as const;

// ---------------------------------------------------------------------------
// Method names
// ---------------------------------------------------------------------------

export const Methods = {
    // Requests (extension -> backend)
    PING: "ping",
    HANDSHAKE: "handshake",
    INIT_PROFILE: "init_profile",
    GET_PROFILE: "get_profile",
    SET_PATH: "set_path",
    ANALYZE_REPO: "analyze_repo",
    GET_RANK: "get_rank",
    RECORD_EVENT: "record_event",
    GET_MESSAGE_TEMPLATES: "get_message_templates",
    // Notifications (backend -> extension)
    NOTIFY_INITIALIZED: "initialized",
    NOTIFY_RANK_CHANGED: "rank_changed",
} as const;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type CharacterPath = "itachi" | "pain" | "obito" | "madara";

export const CHARACTER_PATHS: CharacterPath[] = ["itachi", "pain", "obito", "madara"];

export interface PathInfo {
    key: CharacterPath;
    label: string;
    description: string;
    suffix: string;
}

export const PATH_INFO: Record<CharacterPath, PathInfo> = {
    itachi: {
        key: "itachi",
        label: "Itachi — The Sacrifice",
        description: "Calm, measured, willing to bear the cost.",
        suffix: "Every growth requires sacrifice.",
    },
    pain: {
        key: "pain",
        label: "Pain — The Conviction",
        description: "Relentless; growth forged through hardship.",
        suffix: "Through pain comes progress.",
    },
    obito: {
        key: "obito",
        label: "Obito — The Vision",
        description: "Bends reality toward a chosen future.",
        suffix: "Reality has been corrected.",
    },
    madara: {
        key: "madara",
        label: "Madara — The Ambition",
        description: "Unapologetic drive toward absolute power.",
        suffix: "Your ambition grows stronger.",
    },
};

export function isCharacterPath(value: unknown): value is CharacterPath {
    return typeof value === "string" && (CHARACTER_PATHS as string[]).includes(value);
}

export type GitOp = "commit" | "push" | "pull" | "merge" | "merge_conflict";

export interface Profile {
    name: string;
    path: CharacterPath;
    /** Unix timestamp in milliseconds. */
    created_at: number;
}

export interface RepoStats {
    total_commits: number;
    current_branch: string | null;
    last_seen_sha: string | null;
}

export interface RankInfo {
    /** Human-readable label, e.g. "Chunin". */
    rank: string;
    /** Stable snake_case key, e.g. "chunin". */
    rank_key: string;
    /** The commit count the rank was computed from. */
    current: number;
    /** Floor of the next rank (null at the maximum rank). */
    next_threshold: number | null;
    /** Progress toward the next rank, clamped to [0, 1]. */
    progress: number;
}

export interface MessageTemplate {
    /** Shown while the operation is in flight. */
    in_flight: string;
    /** Shown on completion. */
    completion: string;
}

// ---------------------------------------------------------------------------
// Request params / results
// ---------------------------------------------------------------------------

export interface HandshakeParams {
    version: number;
}

export interface HandshakeResult {
    version: number;
    ok: boolean;
}

export interface InitProfileParams {
    name: string;
    path: CharacterPath;
}

export interface SetPathParams {
    path: CharacterPath;
}

export interface AnalyzeRepoParams {
    path: string;
}

export interface GetRankParams {
    total_commits: number;
}

export interface RecordEventParams {
    repo_path: string;
    op: GitOp;
    sha?: string;
}

export interface GetMessageTemplatesParams {
    path: CharacterPath;
}

export type MessageTemplates = Record<string, MessageTemplate>;

// ---------------------------------------------------------------------------
// Notification payloads
// ---------------------------------------------------------------------------

export interface RankChangedParams {
    repo_path: string;
    old: string;
    new: string;
}

// ---------------------------------------------------------------------------
// Type-level method → result mapping (for a typed BackendClient)
// ---------------------------------------------------------------------------

export interface MethodResultMap {
    [Methods.PING]: void;
    [Methods.HANDSHAKE]: HandshakeResult;
    [Methods.INIT_PROFILE]: Profile;
    [Methods.GET_PROFILE]: Profile | null;
    [Methods.SET_PATH]: Profile;
    [Methods.ANALYZE_REPO]: RepoStats;
    [Methods.GET_RANK]: RankInfo;
    [Methods.RECORD_EVENT]: void;
    [Methods.GET_MESSAGE_TEMPLATES]: MessageTemplates;
}

export interface MethodParamsMap {
    [Methods.PING]: void;
    [Methods.HANDSHAKE]: HandshakeParams;
    [Methods.INIT_PROFILE]: InitProfileParams;
    [Methods.GET_PROFILE]: void;
    [Methods.SET_PATH]: SetPathParams;
    [Methods.ANALYZE_REPO]: AnalyzeRepoParams;
    [Methods.GET_RANK]: GetRankParams;
    [Methods.RECORD_EVENT]: RecordEventParams;
    [Methods.GET_MESSAGE_TEMPLATES]: GetMessageTemplatesParams;
}
