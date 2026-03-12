#!/usr/bin/env node

import('../dist/index.js').catch((error) => {
  console.error('Failed to start Boba CLI:', error.message)
  process.exit(1)
})
