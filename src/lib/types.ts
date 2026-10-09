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

