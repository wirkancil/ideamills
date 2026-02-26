#!/usr/bin/env tsx
// Validate .env.local configuration
// Usage: npx tsx scripts/validate-env.ts

import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
config({ path: path.join(process.cwd(), '.env.local') });

interface ValidationResult {
  key: string;
  required: boolean;
  present: boolean;
  valid: boolean;
  message?: string;
}

function validateEnvFile(): ValidationResult[] {
  const envPath = path.join(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    console.log('❌ File .env.local tidak ditemukan!\n');
    console.log('Buat dengan salah satu cara:');
    console.log('  1. npx tsx scripts/setup-env.ts (interactive)');
    console.log('  2. cp .env.example .env.local (manual edit)\n');
    process.exit(1);
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  const env: Record<string, string> = {};

  // Parse env file
  lines.forEach((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) {
      env[match[1]] = match[2];
    }
  });

  // Validation rules
  const rules: Array<{
    key: string;
    required: boolean;
    validate?: (value: string) => { valid: boolean; message?: string };
  }> = [
    {
      key: 'OPENAI_API_KEY',
      required: true,
      validate: (v) => ({
        valid: v.startsWith('sk-') && v.length > 20,
        message: v.includes('your_') ? 'Placeholder detected! Ganti dengan API key asli' : undefined,
      }),
    },
    {
      key: 'OPENAI_EMBED_MODEL',
      required: true,
      validate: (v) => ({ valid: v === 'text-embedding-3-small' }),
    },
    {
      key: 'GEMINI_API_KEY',
      required: false,
      validate: (v) => ({
        valid: !v || v.startsWith('AIza'),
        message: v.includes('your_') ? 'Skip atau ganti dengan API key asli' : undefined,
      }),
    },
    {
      key: 'MONGODB_URI',
      required: true,
      validate: (v) => ({
        valid: v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'),
        message: v.includes('your_') ? 'Placeholder detected! Ganti dengan URI MongoDB' : undefined,
      }),
    },
    {
        key: 'MONGODB_DB',
        required: false,
        validate: (v) => ({ valid: v.length > 0 })
    },
    {
        key: 'MONGODB_BUCKET',
        required: false,
        validate: (v) => ({ valid: v.length > 0 })
    }
  ];

  const results: ValidationResult[] = rules.map((rule) => {
    const value = env[rule.key];
    const present = value !== undefined && value !== '';
    let valid = true;
    let message = undefined;

    if (rule.required && !present) {
      valid = false;
      message = 'Missing required variable';
    } else if (present && rule.validate) {
      const validation = rule.validate(value);
      valid = validation.valid;
      message = validation.message;
    }

    return {
      key: rule.key,
      required: rule.required,
      present,
      valid,
      message,
    };
  });

  return results;
}

function printResults(results: ValidationResult[]) {
  console.log('🔍 Validating Environment Variables...\n');

  let hasError = false;

  results.forEach((r) => {
    const icon = r.valid ? '✅' : '❌';
    const status = r.valid ? 'OK' : 'INVALID';
    console.log(`${icon} ${r.key.padEnd(30)} ${status}`);
    
    if (!r.valid && r.message) {
      console.log(`   -> ${r.message}`);
      hasError = true;
    }
  });

  console.log('\n' + '='.repeat(50));
  
  if (hasError) {
    console.log('❌ Validation Failed! Please fix .env.local');
    process.exit(1);
  } else {
    console.log('✅ All checks passed! Environment is ready.');
  }
}

const results = validateEnvFile();
printResults(results);
