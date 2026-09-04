export const ClaudeCodeServicePath = '/services/claude-code';
export const ClaudeCodeService = Symbol('ClaudeCodeService');

/**
 * What the backend managed to dig up about the locally installed Claude Code
 * CLI. If {@link available} is false, {@link error} explains why so the UI can
 * nudge the user toward installing it instead of failing silently.
 */
export interface ClaudeCliInfo {
  readonly available: boolean;
  /**
   * The resolved command used to launch the CLI. Either the absolute path we
   * found on disk or the bare `claude` command when we trust it's on `PATH`.
   */
  readonly command?: string;
  /**
   * Version string as reported by `claude --version`, sans the trailing
   * `(Claude Code)` noise. Undefined when detection failed.
   */
  readonly version?: string;
  readonly error?: string;
}

export interface ClaudeCodeService {
  /**
   * Locates the Claude Code CLI. When {@link preferredCommand} is set (from the
   * `arduino.claudeCode.executablePath` preference) it wins, provided it
   * actually runs. Otherwise we fall back to whatever `claude` resolves to on
   * the system `PATH`.
   */
  detect(preferredCommand?: string): Promise<ClaudeCliInfo>;
}
