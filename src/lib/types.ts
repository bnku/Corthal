export interface VaultNode {
  name: string;
  relative_path: string;
  is_dir: boolean;
  children: VaultNode[];
  size_bytes?: number;
  title?: string;
  icon?: string;
  order?: number;
  color?: string;
  description?: string;
}

export interface HubItem {
  id: string;
  name: string;
  icon: string;
  color?: string;
  description?: string;
}

export interface NoteFrontmatter {
  title?: string;
  date?: string;
  tags?: string[];
  status?: string;
  [key: string]: any;
}

export interface VaultInfo {
  name: string;
  path: string;
  display_path: string;
  ssh_key?: string;
  is_default: boolean;
}

export interface VaultSummary {
  name: string;
  path: string;
  display_path: string;
  last_opened: number;
  ssh_key?: string;
}

export interface SshKeyInfo {
  path: string;
  filename: string;
  key_type: string;
  comment?: string;
  fingerprint: string;
  is_active: boolean;
}

export type AssistantProvider = "codex" | "openrouter" | "openai";

export interface AssistantConfig {
  provider: AssistantProvider;
  codex_model: string;
  codex_sandbox: "read-only" | "workspace-write";
  codex_reasoning_effort?: string;
  openrouter_key: string | null;
  openrouter_model: string;
  openrouter_reasoning_effort?: string;
  openrouter_temperature: number;
  openai_base_url: string;
  openai_key: string | null;
  openai_model: string;
  openai_reasoning_effort?: string;
  openai_temperature: number;
  system_prompt: string;
  include_vault_context: boolean;
  include_active_note: boolean;
}

export interface CodexStatus {
  installed: boolean;
  binary_path: string;
  login_status: string;
  is_logged_in: boolean;
  available_models: string[];
}

export interface AssistantStreamChunk {
  session_id: string;
  delta: string;
  full_text: string;
  done: boolean;
  error: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
  model?: string;
  provider?: string;
  isStreaming?: boolean;
}


