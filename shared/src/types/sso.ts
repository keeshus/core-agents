export interface SSOConfig {
  id: number;
  provider: string;
  clientId: string;
  clientSecret: string; // masked on read
  issuer: string;
  redirectUri: string;
  groupClaim: string;
  adminGroupMapping: string[];
  editorGroupMapping: string[];
  enabled: boolean;
  updatedAt: string;
}
