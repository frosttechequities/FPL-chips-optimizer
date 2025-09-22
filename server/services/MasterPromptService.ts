/**
 * MasterPromptService
 * Loads and caches the constitutional master prompt for The FPL Architect.
 */

import fs from 'fs';
import path from 'path';

export class MasterPromptService {
  private static instance: MasterPromptService;
  private promptText: string | null = null;
  private lastLoadedMs: number = 0;
  private readonly reloadIntervalMs = 60_000; // reload at most once per minute
  private readonly promptFileName = 'MASTER_PROMPT_FPL_Architect.md';

  public static getInstance(): MasterPromptService {
    if (!MasterPromptService.instance) {
      MasterPromptService.instance = new MasterPromptService();
    }
    return MasterPromptService.instance;
  }

  /**
   * Return the master prompt text. If file missing, returns empty string.
   * Hot-reloads periodically; set USE_MASTER_PROMPT=0 to disable usage upstream.
   */
  public getMasterPrompt(): string {
    const now = Date.now();
    if (this.promptText && now - this.lastLoadedMs < this.reloadIntervalMs) {
      return this.promptText;
    }

    try {
      const filePath = this.resolvePromptPath();
      const content = fs.readFileSync(filePath, 'utf8');
      this.promptText = content.trim();
      this.lastLoadedMs = now;
      return this.promptText;
    } catch (err) {
      // If file not found or unreadable, fail gracefully
      this.promptText = '';
      this.lastLoadedMs = now;
      return '';
    }
  }

  private resolvePromptPath(): string {
    // Prefer project root working directory
    const cwdPath = path.resolve(process.cwd(), this.promptFileName);
    if (fs.existsSync(cwdPath)) return cwdPath;

    // Try relative to this file (useful when bundled)
    const localPath = path.resolve(__dirname, '..', '..', this.promptFileName);
    if (fs.existsSync(localPath)) return localPath;

    return cwdPath; // default to CWD even if not present
  }
}

export default MasterPromptService;


