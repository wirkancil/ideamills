#!/usr/bin/env node
/**
 * Direct TypeScript runner using tsx
 */

const { spawn } = require('child_process');
const path = require('path');

const genId = process.argv[2];
const payloadFile = process.argv[3];

if (!genId || !payloadFile) {
  console.error('Usage: node runGeneration.js <genId> <payloadFile>');
  process.exit(1);
}

async function main() {
  try {
    console.log(`🚀 Running generation ${genId.substring(0, 8)}...`);

    // Use tsx to run TypeScript directly
    const child = spawn('npx', ['tsx', path.join(__dirname, 'runGeneration.ts'), genId, payloadFile], {
      stdio: 'inherit',
      env: { ...process.env }
    });

    return new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0) {
          console.log('✅ Generation completed');
          resolve(0);
        } else {
          console.error(`❌ Generation failed with exit code ${code}`);
          reject(new Error(`Exit code: ${code}`));
        }
      });

      child.on('error', (error) => {
        console.error('❌ Failed to start generation:', error);
        reject(error);
      });
    });
  } catch (error) {
    console.error('❌ Generation failed:', error.message);
    process.exit(1);
  }
}

main();
