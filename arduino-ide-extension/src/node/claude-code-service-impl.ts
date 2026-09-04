import { injectable } from '@theia/core/shared/inversify';
import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import {
  ClaudeCliInfo,
  ClaudeCodeService,
} from '../common/protocol/claude-code-service';

const installHint =
  "The 'claude' CLI was not found. Install it from https://claude.com/claude-code and restart the IDE.";

@injectable()
export class ClaudeCodeServiceImpl implements ClaudeCodeService {
  async detect(preferredCommand?: string): Promise<ClaudeCliInfo> {
    const candidates: string[] = [];
    const preferred = preferredCommand?.trim();
    if (preferred) {
      candidates.push(preferred);
    }
    candidates.push('claude');

    let lastError = installHint;
    for (const candidate of candidates) {
      const resolved = this.resolveOnPath(candidate);
      if (!resolved) {
        lastError = `Could not locate '${candidate}'. Is it on your PATH?`;
        continue;
      }
      try {
        const version = await this.queryVersion(resolved);
        return { available: true, command: resolved, version };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    return { available: false, error: lastError };
  }

  /**
   * Walks `PATH` by hand instead of shelling out to `where`/`which`. Keeps a
   * user-supplied preference string from ever reaching a shell, and lets us
   * honor `PATHEXT` so `claude.cmd`, `claude.exe`, and bare `claude` all
   * resolve the same way the OS would.
   */
  private resolveOnPath(command: string): string | undefined {
    const isWin = process.platform === 'win32';
    const exts = isWin
      ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
          .split(';')
          .map((ext) => ext.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const looksLikePath =
      isAbsolute(command) ||
      command.includes('/') ||
      (isWin && command.includes('\\'));

    if (looksLikePath) {
      return this.firstRunnable(command, exts);
    }

    const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
    for (const dir of dirs) {
      const hit = this.firstRunnable(join(dir, command), exts);
      if (hit) {
        return hit;
      }
    }
    return undefined;
  }

  private firstRunnable(base: string, exts: string[]): string | undefined {
    const alreadyHasExt =
      exts.length > 0 && exts.some((ext) => base.toLowerCase().endsWith(ext));
    const candidates = alreadyHasExt
      ? [base]
      : [base, ...exts.map((ext) => `${base}${ext}`)];
    for (const candidate of candidates) {
      try {
        accessSync(candidate, constants.F_OK);
        return candidate;
      } catch {
        // next
      }
    }
    return undefined;
  }

  private queryVersion(resolved: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // Post-CVE-2024-27980 Node refuses to spawn .cmd/.bat without a shell, so
      // those get the shell treatment while real binaries run bare.
      const lower = resolved.toLowerCase();
      const needsShell =
        process.platform === 'win32' &&
        (lower.endsWith('.cmd') || lower.endsWith('.bat'));

      const cp = spawn(resolved, ['--version'], {
        windowsHide: true,
        shell: needsShell,
      });

      const out: Buffer[] = [];
      const err: Buffer[] = [];
      const killTimer = setTimeout(() => {
        cp.kill();
        reject(new Error(`Timed out probing '${resolved} --version'.`));
      }, 7000);

      cp.stdout?.on('data', (chunk: Buffer) => out.push(chunk));
      cp.stderr?.on('data', (chunk: Buffer) => err.push(chunk));
      cp.on('error', (error) => {
        clearTimeout(killTimer);
        reject(error);
      });
      cp.on('exit', (code) => {
        clearTimeout(killTimer);
        if (code !== 0) {
          const detail = Buffer.concat(err).toString('utf8').trim();
          reject(
            new Error(
              `'${resolved} --version' exited with ${code}${
                detail ? `: ${detail}` : ''
              }`
            )
          );
          return;
        }
        const raw = Buffer.concat(out).toString('utf8').trim();
        // The CLI prints e.g. "2.1.156 (Claude Code)" — grab the semver, drop the parenthetical.
        const match = raw.match(/(\d+\.\d+\.\d+[^\s]*)/);
        resolve(match ? match[1] : raw);
      });
    });
  }
}
