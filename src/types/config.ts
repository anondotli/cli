export interface AnonliConfig {
  apiKey?: string;
  baseUrl: string;
  lastVersionCheck?: number;
  latestVersion?: string;
  userEmail?: string;
  userName?: string | null;
}

export const DEFAULT_CONFIG: AnonliConfig = {
  baseUrl: "https://anon.li",
};
