import pino from 'pino';

// Create a logger instance
export const logger = pino({
  level: 'info', // Set to 'debug' for more verbose logging
  base: {
    // Add context like service name, environment, etc.
    service: 'notion-progress-tracker',
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
});
