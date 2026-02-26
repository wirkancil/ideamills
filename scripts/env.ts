import { config } from 'dotenv';
import path from 'path';

// Load .env.local
config({ path: path.join(process.cwd(), '.env.local') });
