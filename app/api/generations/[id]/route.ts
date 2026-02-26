import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/lib/mongoClient';
import { ObjectId } from 'mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    console.log(`[API] Fetching generation: ${id.substring(0, 8)}...`);

    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      console.error(`[API] Invalid ID format: ${id}`);
      return NextResponse.json({ error: 'Invalid generation ID format' }, { status: 400 });
    }

    const db = await getDb();
    const generation = await db.collection('Generations').findOne({ _id: objectId });
    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
    }

    const generationId = objectId.toString();
    const count = await db.collection('Scripts').countDocuments({ generation_id: generationId });
    const distinctThemes = await db.collection('Scripts').distinct('theme', { generation_id: generationId });
    const uniqueThemes = distinctThemes.length;

    const themeCountsAgg = await db.collection('Scripts')
      .aggregate([
        { $match: { generation_id: generationId } },
        { $group: { _id: '$theme', count: { $sum: 1 } } },
      ])
      .toArray();
    const themeCounts: Record<string, number> = {};
    themeCountsAgg.forEach((t) => {
      if (t._id) themeCounts[String(t._id)] = t.count;
    });

    // Get paginated variations
    const offset = (page - 1) * pageSize;
    
    // Try to fetch with error handling
    let scriptData: any[] = [];
    let scriptError: any = null;
    
    try {
      const scripts = await db.collection('Scripts')
        .find({ generation_id: generationId })
        .sort({ idx: 1 })
        .skip(offset)
        .limit(pageSize)
        .toArray();

      const scriptIds = scripts.map((s) => s._id.toString());
      const scenes = await db.collection('Scenes')
        .find({ script_id: { $in: scriptIds } })
        .toArray();

      const scenesByScript: Record<string, any[]> = {};
      scenes.forEach((scene) => {
        const sid = String(scene.script_id);
        scenesByScript[sid] = scenesByScript[sid] || [];
        scenesByScript[sid].push(scene);
      });

      scriptData = scripts.map((script) => ({
        id: script._id.toString(),
        theme: script.theme,
        idx: script.idx,
        directors_script: script.directors_script,
        Scenes: scenesByScript[script._id.toString()] || [],
      }));
    } catch (fetchErr) {
      console.error('Exception during script fetch:', fetchErr);
      scriptError = fetchErr;
    }

    if (scriptError) {
      console.error('Script fetch error:', scriptError);
      // Return empty variations instead of error, so user can still see generation status
      scriptData = [];
    }

    // Transform to API format with sanitization
    const variations = (scriptData || []).map((script: any, scriptIndex: number) => {
      try {
        // Sanitize strings to prevent JSON parsing errors
        const sanitize = (str: string | null | undefined, fieldName: string): string | undefined => {
          if (!str) return undefined;

          try {
            // Convert to string first
            let cleaned = String(str);

            // Early truncation for very long strings to prevent performance issues
            if (cleaned.length > 100000) {
              console.warn(`[API] Field ${fieldName} extremely long (${cleaned.length} chars), aggressive truncation...`);
              cleaned = cleaned.substring(0, 100000);
            }

            // Remove null bytes and other problematic characters
            cleaned = cleaned.replace(/\0/g, '');

            // Remove control characters that can break JSON
            // But keep newlines and tabs for formatting
            cleaned = cleaned
              .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n, \r, \t
              .replace(/\r\n/g, '\n') // Normalize line endings
              .replace(/\r/g, '\n'); // Convert \r to \n

            // Fix unterminated strings - improved algorithm
            // This handles cases where there are unmatched quotes
            let fixedQuotes = '';
            let inString = false;
            let escapeNext = false;
            let quoteCount = 0;

            for (let i = 0; i < cleaned.length; i++) {
              const char = cleaned[i];

              if (escapeNext) {
                // If we're escaping, just add the character
                fixedQuotes += char;
                escapeNext = false;
              } else if (char === '\\') {
                // Backslash - escape it and the next character
                fixedQuotes += '\\\\';
                escapeNext = true;
              } else if (char === '"') {
                // Quote - escape it to prevent unterminated string errors
                fixedQuotes += '\\"';
                quoteCount++;
              } else {
                // Normal character - just add it
                fixedQuotes += char;
              }
            }

            // Check if we have an odd number of quotes, which might indicate unterminated string
            if (quoteCount % 2 !== 0) {
              console.warn(`[API] Field ${fieldName} has odd number of quotes (${quoteCount}), potential unterminated string`);
              // Add an escaped quote to balance
              fixedQuotes += '\\"';
            }

            cleaned = fixedQuotes;

            // Additional safety: ensure string is valid JSON when wrapped in quotes
            try {
              // Test if it can be JSON stringified
              JSON.stringify(cleaned);
            } catch (jsonTestErr) {
              console.warn(`[API] Field ${fieldName} failed JSON test, applying aggressive sanitization`);
              // More aggressive: remove all problematic characters
              cleaned = cleaned
                .replace(/[^\x20-\x7E\n\t]/g, '') // Keep only printable ASCII + newline + tab
                .replace(/"/g, "'") // Replace quotes with single quotes
                .substring(0, 10000); // Truncate aggressively

              // Test again after aggressive sanitization
              try {
                JSON.stringify(cleaned);
              } catch (finalTestErr) {
                console.error(`[API] Field ${fieldName} still fails JSON test after aggressive sanitization, using fallback`);
                // Last resort: return empty string
                return '';
              }
            }

            // Limit length to prevent huge responses (max 50KB per field)
            if (cleaned.length > 50000) {
              console.warn(`[API] Warning: Field ${fieldName} too long (${cleaned.length} chars), truncating...`);
              cleaned = cleaned.substring(0, 50000) + '\n\n[Truncated - content too long]';
            }

            return cleaned || undefined;
          } catch (sanitizeError) {
            console.error(`[API] Error sanitizing ${fieldName} for script ${script.idx}:`, sanitizeError);
            // Return empty string instead of undefined to prevent undefined errors
            return '';
          }
        };

        const processedScript = {
          id: `var_${String(script.idx).padStart(3, '0')}`,
          theme: sanitize(script.theme, 'theme') || '',
          scenes: (script.Scenes || [])
            .sort((a: any, b: any) => a.order - b.order)
            .map((scene: any, sceneIdx: number) => {
              try {
                return {
                  struktur: scene.struktur || '',
                  naskah_vo: sanitize(scene.naskah_vo, `scene_${sceneIdx}_naskah_vo`) || '',
                  visual_idea: sanitize(scene.visual_idea, `scene_${sceneIdx}_visual_idea`) || '',
                  text_to_image: sanitize(scene.text_to_image, `scene_${sceneIdx}_text_to_image`),
                  image_to_video: sanitize(scene.image_to_video, `scene_${sceneIdx}_image_to_video`),
                };
              } catch (sceneError) {
                console.error(`[API] Error processing scene ${sceneIdx} in script ${script.idx}:`, sceneError);
                return {
                  struktur: scene.struktur || '',
                  naskah_vo: '',
                  visual_idea: '',
                  text_to_image: undefined,
                  image_to_video: undefined,
                };
              }
            }),
        };

        // Test serialization of this script with try-catch for each field
        let serializable = true;
        try {
          // Test each field individually to identify problematic field
          for (const scene of processedScript.scenes) {
            JSON.stringify(scene.naskah_vo);
            JSON.stringify(scene.visual_idea);
            if (scene.text_to_image) JSON.stringify(scene.text_to_image);
            if (scene.image_to_video) JSON.stringify(scene.image_to_video);
          }
          JSON.stringify(processedScript);
        } catch (testError) {
          console.error(`[API] Script ${script.idx} failed serialization test:`, testError);
          serializable = false;
        }
        
        if (!serializable) {
          // Return minimal structure with empty scenes but preserve theme
          return {
            id: `var_${String(script.idx).padStart(3, '0')}`,
            theme: processedScript.theme || 'Unknown',
            scenes: processedScript.scenes.map(() => ({
              struktur: '',
              naskah_vo: '',
              visual_idea: '',
              text_to_image: undefined,
              image_to_video: undefined,
            })),
          };
        }

        return processedScript;
      } catch (err) {
        console.error(`[API] Error processing script ${script.idx}:`, err);
        // Return minimal valid structure
        return {
          id: `var_${String(script.idx).padStart(3, '0')}`,
          theme: 'Unknown',
          scenes: [],
        };
      }
    });

    // Map database status to frontend status
    const statusMap: Record<string, string> = {
      'queued': 'queued',
      'processing': 'processing',
      'completed': 'succeeded',
      'failed': 'failed',
      'cancelled': 'canceled',
    };
    
    const frontendStatus = statusMap[generation.status] || generation.status;

    // Try to serialize response to catch any JSON errors early
    let responseData;
    try {
      responseData = {
        id: generationId,
        status: frontendStatus,
        progress: generation.progress || 0,
        engine: generation.engine,
        productIdentifier: generation.product_identifier,
        error: generation.error_message || generation.error || undefined,
        createdAt: generation.created_at,
        counts: {
          themes: uniqueThemes,
          scripts: count || 0,
          variations: count || 0,
        },
        themeCounts, // Add theme counts for grouping
        page,
        pageSize,
        totalVariations: count || 0,
        variations,
      };

      // Test JSON serialization to catch errors early
      JSON.stringify(responseData);
    } catch (jsonError) {
      console.error('JSON serialization error:', jsonError);
      console.error('Variations count:', variations.length);
      
      // Try to identify problematic variation
      const problematicVariations: number[] = [];
      for (let i = 0; i < variations.length; i++) {
        try {
          JSON.stringify(variations[i]);
        } catch (err) {
          problematicVariations.push(i);
          console.error(`Problematic variation at index ${i}:`, err);
        }
      }

      // Return error response with details
      return NextResponse.json({
        error: 'Failed to serialize response data',
        details: `JSON serialization failed. Problematic variations: ${problematicVariations.length}`,
        variationsCount: variations.length,
        problematicIndices: problematicVariations,
      }, { status: 500 });
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Get generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action === 'cancel') {
      let cancelId: ObjectId;
      try {
        cancelId = new ObjectId(id);
      } catch {
        return NextResponse.json({ error: 'Invalid generation ID format' }, { status: 400 });
      }

      const db = await getDb();
      const result = await db.collection('Generations').updateOne(
        { _id: cancelId },
        { $set: { status: 'canceled', updated_at: new Date() } }
      );

      if (!result.acknowledged) {
        return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Cancel generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
