import dotenv from 'dotenv';

dotenv.config();

export interface LemailMcpConfig {
  apiUrl: string;
  apiKey?: string;
  apiToken?: string;
  email?: string;
  password?: string;
  serverName: string;
  serverVersion: string;
}

export function loadConfig(): LemailMcpConfig {
  const rawApiUrl = process.env.LEMAIL_API_URL || 'http://localhost:9200/api';
  let apiUrl = rawApiUrl.replace(/\/+$/, '');
  if (!apiUrl.endsWith('/api')) {
    apiUrl = `${apiUrl}/api`;
  }

  return {
    apiUrl,
    apiKey: process.env.LEMAIL_API_KEY,
    apiToken: process.env.LEMAIL_API_TOKEN,
    email: process.env.LEMAIL_EMAIL,
    password: process.env.LEMAIL_PASSWORD,
    serverName: process.env.LEMAIL_MCP_SERVER_NAME || 'lemail-mcp-server',
    serverVersion: '1.0.0',
  };
}
