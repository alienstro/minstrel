export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export * from './adapters.js';
export * from './generation-input.js';
