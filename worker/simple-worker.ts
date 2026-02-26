#!/usr/bin/env tsx
/**
 * Simple Worker - Otomatis & Langsung
 * Tanpa kompleksitas, tanpa error handling berlebih
 */

import { config } from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import { dequeueJob, completeJob, failJob } from '../app/lib/queue';

// Load environment
config({ path: path.join(process.cwd(), '.env.local') });

const execAsync = promisify(exec);

const POLL_INTERVAL = 3000; // 3 detik

// No import - use exec approach like the original worker

async function processJob() {
  try {
    const job = await dequeueJob();
    if (!job) return;
    console.log(`🚀 Processing job: ${job.id.substring(0, 8)}`);

    // Run generation with exec approach
    try {
      console.log(`🚀 Starting generation...`);

      // Write payload to file
      const payloadFile = path.join(os.tmpdir(), `payload-${job.generation_id}-${Date.now()}.json`);
      fs.writeFileSync(payloadFile, JSON.stringify(job.payload), 'utf8');

      // Execute generation script using working JS runner
      const workerScript = path.resolve(process.cwd(), 'worker', 'runGeneration.js');
      const command = `node ${workerScript} ${job.generation_id} ${payloadFile}`;

      console.log(`📂 Executing generation...`);

      // Cleanup function
      const cleanup = () => {
        try {
          if (fs.existsSync(payloadFile)) fs.unlinkSync(payloadFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      };

      // Add timeout protection (10 minutes max)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Generation timeout after 10 minutes')), 10 * 60 * 1000);
      });

      try {
        await Promise.race([
          execAsync(command, {
            cwd: process.cwd(),
            env: { ...process.env },
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          }),
          timeoutPromise
        ]);
      } finally {
        cleanup();
      }

      // Mark completed
      await completeJob(job.id);

      console.log(`✅ Job completed: ${job.id.substring(0, 8)}`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Generation error: ${errorMsg}`);

      // Mark failed
      await failJob(job.id, errorMsg.substring(0, 500));

      console.log(`❌ Job failed: ${job.id.substring(0, 8)} - ${errorMsg}`);
    }

  } catch (error) {
    console.error('Worker error:', error);
  }
}

// Simple loop
async function startWorker() {
  console.log('🔄 Simple Worker Started');

  while (true) {
    await processJob();
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Worker stopped');
  process.exit(0);
});

startWorker();
