export interface VaultNode {
  name: string;
  relative_path: string;
  is_dir: boolean;
  children: VaultNode[];
  size_bytes?: number;
}

export type HubId = "all" | "00-Inbox" | "10-System" | "20-Work" | "30-Life" | "40-Resources" | "90-Archive";

export interface HubInfo {
  id: HubId;
  name: string;
  icon: string;
  description: string;
  color: string;
}
