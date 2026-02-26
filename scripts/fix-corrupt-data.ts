#!/usr/bin/env tsx
/**
 * Script to fix corrupt data in database that causes JSON parsing errors
 */

import './env';
import { getDb, closeDb } from '../app/lib/mongoClient';
import { ObjectId } from 'mongodb';

const generationId = process.argv[2];

if (!generationId) {
  console.error('❌ Usage: tsx scripts/fix-corrupt-data.ts <generation-id>');
  process.exit(1);
}

async function fixCorruptData() {
  console.log(`🔍 Checking generation: ${generationId}\n`);

  try {
    const db = await getDb();
    
    // Get all scripts for this generation
    const scripts = await db.collection('Scripts')
      .find({ generation_id: generationId })
      .toArray();

    if (scripts.length === 0) {
      console.log('✅ No scripts found for this generation');
      return;
    }

    console.log(`📊 Found ${scripts.length} scripts\n`);

    const scriptIds = scripts.map(s => s._id.toString());
    
    // Get all scenes
    const scenes = await db.collection('Scenes')
      .find({ script_id: { $in: scriptIds } })
      .toArray();

    console.log(`📊 Found ${scenes.length} scenes associated with these scripts\n`);

    // Group scenes by script
    const scenesByScript = new Map();
    scenes.forEach(scene => {
      const sid = scene.script_id;
      if (!scenesByScript.has(sid)) scenesByScript.set(sid, []);
      scenesByScript.get(sid).push(scene);
    });

    let fixedCount = 0;
    let errorCount = 0;

    for (const script of scripts) {
      const scriptIdStr = script._id.toString();
      const scriptScenes = scenesByScript.get(scriptIdStr) || [];
      
      if (scriptScenes.length === 0) continue;

      for (const scene of scriptScenes) {
        const sanitize = (str: string | null | undefined): string | null => {
          if (!str) return null;
          
          try {
            // Remove control characters
            let cleaned = String(str)
              .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
              .replace(/\r\n/g, '\n')
              .replace(/\r/g, '\n');

            // Fix unterminated quotes (simple heuristic)
            let quoteCount = 0;
            let escaped = false;
            for (let i = 0; i < cleaned.length; i++) {
              if (cleaned[i] === '\\') {
                escaped = !escaped;
              } else if (cleaned[i] === '"' && !escaped) {
                quoteCount++;
              } else {
                escaped = false;
              }
            }

            if (quoteCount % 2 !== 0) {
              // Escape all unescaped quotes - naive fix
               cleaned = cleaned.replace(/([^\\])"/g, '$1\\"').replace(/^"/g, '\\"');
            }

            // Limit length
            if (cleaned.length > 50000) {
              cleaned = cleaned.substring(0, 50000) + '\n\n[Truncated]';
            }

            return cleaned;
          } catch (err) {
            return str; // Return original if error
          }
        };

        let needsUpdate = false;
        const updates: any = {};

        // Check fields
        const fields = ['naskah_vo', 'visual_idea', 'text_to_image', 'image_to_video'];
        for (const field of fields) {
          const original = scene[field];
          if (original) {
             const sanitized = sanitize(original);
             if (sanitized !== original && sanitized !== null) {
               updates[field] = sanitized;
               needsUpdate = true;
             }
          }
        }

        if (needsUpdate) {
           try {
             await db.collection('Scenes').updateOne(
               { _id: scene._id },
               { $set: updates }
             );
             fixedCount++;
             process.stdout.write('.');
           } catch (e) {
             errorCount++;
             console.error(`\n❌ Failed to update scene ${scene._id}:`, e);
           }
        }
      }
    }

    console.log(`\n\n✅ Done! Fixed ${fixedCount} scenes.`);
    if (errorCount > 0) {
      console.log(`⚠️  ${errorCount} errors encountered.`);
    }

  } catch (error) {
    console.error('❌ Error fixing corrupt data:', error);
  } finally {
    await closeDb();
  }
}

fixCorruptData();
