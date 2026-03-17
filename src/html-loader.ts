import { readFileSync } from 'fs';
import { join } from 'path';

export function loadHTML(filename: string): string {
  try {
    const path = join(process.cwd(), 'dist', filename);
    return readFileSync(path, 'utf-8');
  } catch (error) {
    console.error(`Failed to load ${filename}:`, error);
    return '<html><body><h1>File not found</h1></body></html>';
  }
}
