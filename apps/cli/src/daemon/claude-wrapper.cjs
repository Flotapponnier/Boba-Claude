/**
 * Claude Wrapper - Launches Claude CLI in-process
 * Based on Happy CLI's approach
 */

// Get CLI path from args
const cliPath = process.argv[2];

if (!cliPath) {
  console.error('Error: No CLI path provided');
  process.exit(1);
}

// Disable autoupdater
process.env.DISABLE_AUTOUPDATER = '1';

// Import and run Claude CLI
try {
  const { pathToFileURL } = require('url');
  const importUrl = pathToFileURL(cliPath).href;
  import(importUrl);
} catch (error) {
  console.error('Failed to load Claude CLI:', error);
  process.exit(1);
}
