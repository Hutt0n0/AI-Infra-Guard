import { ApiResponse } from '../types/model';
import { apiFetch } from './http';

const API_BASE_URL = '/api/v1/knowledge';

export const pluginApi = {
  // Get all MCP plugin names
  async getMcpPluginNames(): Promise<ApiResponse<string[]>> {
    const response = await apiFetch(`${API_BASE_URL}/mcp/names`);
    return response.json();
  },
}; 