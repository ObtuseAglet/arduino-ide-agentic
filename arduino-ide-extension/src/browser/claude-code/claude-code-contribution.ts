import {
  StatusBar,
  StatusBarAlignment,
} from '@theia/core/lib/browser/status-bar/status-bar';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import {
  ClaudeCliInfo,
  ClaudeCodeService,
} from '../../common/protocol/claude-code-service';
import { ArduinoMenus } from '../menu/arduino-menus';
import { ClaudeCodeContext } from './claude-code-context';
import {
  Command,
  CommandRegistry,
  Contribution,
  KeybindingRegistry,
  MenuModelRegistry,
} from '../contributions/contribution';

const claudeTerminalId = 'claude-code-terminal';
const claudeStatusBarId = 'claude-code-status';
const installUrl = 'https://claude.com/claude-code';

@injectable()
export class ClaudeCode extends Contribution {
  @inject(TerminalService)
  private readonly terminalService: TerminalService;

  @inject(ClaudeCodeService)
  private readonly claudeCodeService: ClaudeCodeService;

  @inject(ClaudeCodeContext)
  private readonly context: ClaudeCodeContext;

  @inject(StatusBar)
  private readonly statusBar: StatusBar;

  private terminal: TerminalWidget | undefined;
  private cliInfo: ClaudeCliInfo | undefined;

  override onReady(): void {
    // Don't fire off a `claude --version` subprocess at every boot for a feature
    // the user might never open. Just paint the status bar entry; we learn the
    // actual version lazily the first time someone launches a session.
    this.updateStatusBar();
  }

  override registerCommands(registry: CommandRegistry): void {
    registry.registerCommand(ClaudeCode.Commands.OPEN, {
      execute: () => this.open(false),
    });
    registry.registerCommand(ClaudeCode.Commands.NEW_SESSION, {
      execute: () => this.open(true),
    });
    registry.registerCommand(ClaudeCode.Commands.SEED_CONTEXT, {
      execute: () => this.seedContext(),
    });
  }

  override registerMenus(registry: MenuModelRegistry): void {
    registry.registerSubmenu(
      ArduinoMenus.CLAUDE,
      nls.localize('arduino/claudeCode/menu', 'Claude')
    );
    registry.registerMenuAction(ArduinoMenus.CLAUDE__MAIN_GROUP, {
      commandId: ClaudeCode.Commands.OPEN.id,
      label: nls.localize('arduino/claudeCode/open', 'Open Claude Code'),
      order: '0',
    });
    registry.registerMenuAction(ArduinoMenus.CLAUDE__MAIN_GROUP, {
      commandId: ClaudeCode.Commands.NEW_SESSION.id,
      label: nls.localize('arduino/claudeCode/newSession', 'New Session'),
      order: '1',
    });
    registry.registerMenuAction(ArduinoMenus.CLAUDE__CONTEXT_GROUP, {
      commandId: ClaudeCode.Commands.SEED_CONTEXT.id,
      label: nls.localize(
        'arduino/claudeCode/seedContext',
        'Add Arduino Context File'
      ),
      order: '0',
    });
    // A second doorway under Tools for folks who go looking there first.
    registry.registerMenuAction(ArduinoMenus.TOOLS__MAIN_GROUP, {
      commandId: ClaudeCode.Commands.OPEN.id,
      label: nls.localize('arduino/claudeCode/open', 'Open Claude Code'),
      order: 'z_claude',
    });
  }

  override registerKeybindings(registry: KeybindingRegistry): void {
    registry.registerKeybinding({
      command: ClaudeCode.Commands.OPEN.id,
      keybinding: 'CtrlCmd+Alt+C',
    });
  }

  private async detect(force = false): Promise<ClaudeCliInfo> {
    if (this.cliInfo?.available && !force) {
      return this.cliInfo;
    }
    const preferred = this.preferences['arduino.claudeCode.executablePath'];
    this.cliInfo = await this.claudeCodeService.detect(preferred || undefined);
    return this.cliInfo;
  }

  private async open(freshSession: boolean): Promise<void> {
    if (freshSession && this.terminal && !this.terminal.isDisposed) {
      this.terminal.dispose();
      this.terminal = undefined;
    }

    if (!freshSession && this.terminal && !this.terminal.isDisposed) {
      this.terminalService.open(this.terminal);
      return;
    }

    const info = await this.detect(true);
    if (!info.available || !info.command) {
      this.messageService.error(
        nls.localize(
          'arduino/claudeCode/notFound',
          "Couldn't start Claude Code: {0} Install it from {1}.",
          info.error ?? '',
          installUrl
        )
      );
      return;
    }
    // Now that we've actually probed the CLI, let the status bar show the version.
    this.updateStatusBar();

    const injectContext =
      this.preferences['arduino.claudeCode.injectArduinoContext'];
    const resolved = await this.context.resolve();

    if (this.preferences['arduino.claudeCode.autoSeedClaudeMd']) {
      try {
        await this.context.seedClaudeMd(resolved);
      } catch (err) {
        this.logger.warn(`Could not seed CLAUDE.md: ${err}`);
      }
    }

    const { shellPath, shellArgs } = this.buildLaunch(info.command);
    const env = injectContext ? resolved.env : { ARDUINO_IDE: '1' };

    try {
      const terminal = await this.terminalService.newTerminal({
        id: claudeTerminalId,
        title: nls.localize('arduino/claudeCode/terminalTitle', 'Claude Code'),
        iconClass: 'codicon codicon-sparkle',
        cwd: resolved.cwd,
        env,
        shellPath,
        shellArgs,
        useServerTitle: false,
        destroyTermOnClose: true,
      });
      await terminal.start();
      this.terminalService.open(terminal);
      this.terminal = terminal;
      terminal.onDidDispose(() => {
        if (this.terminal === terminal) {
          this.terminal = undefined;
        }
      });
    } catch (err) {
      this.messageService.error(
        nls.localize(
          'arduino/claudeCode/launchFailed',
          'Failed to launch Claude Code: {0}',
          err instanceof Error ? err.message : String(err)
        )
      );
    }
  }

  private async seedContext(): Promise<void> {
    const resolved = await this.context.resolve();
    const result = await this.context.seedClaudeMd(resolved);
    if (result === 'no-sketch') {
      this.messageService.warn(
        nls.localize(
          'arduino/claudeCode/noSketch',
          'Open a sketch first — there is no folder to write CLAUDE.md into.'
        )
      );
      return;
    }
    if (result === 'exists') {
      this.messageService.info(
        nls.localize(
          'arduino/claudeCode/contextExists',
          'A CLAUDE.md already exists in this sketch. Left it untouched.'
        )
      );
      return;
    }
    this.messageService.info(
      nls.localize(
        'arduino/claudeCode/contextCreated',
        'Wrote CLAUDE.md with the current Arduino project context.'
      )
    );
  }

  /**
   * Turn the resolved CLI command plus prefs into a PTY launch spec. We run the
   * binary directly so there's no shell-quoting roulette — except for Windows
   * `.cmd`/`.bat` shims, which only run through `cmd.exe`.
   */
  private buildLaunch(command: string): {
    shellPath: string;
    shellArgs: string[];
  } {
    const args: string[] = [];
    const model = this.preferences['arduino.claudeCode.model'];
    if (model && model.trim()) {
      args.push('--model', model.trim());
    }
    const extra = this.preferences['arduino.claudeCode.additionalArgs'];
    if (Array.isArray(extra)) {
      args.push(...extra.filter((arg) => typeof arg === 'string' && arg.length));
    }

    const lower = command.toLowerCase();
    if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
      return { shellPath: 'cmd.exe', shellArgs: ['/c', command, ...args] };
    }
    return { shellPath: command, shellArgs: args };
  }

  private updateStatusBar(): void {
    const available = this.cliInfo?.available;
    const tooltip = available
      ? nls.localize(
          'arduino/claudeCode/statusReady',
          'Claude Code {0} — click to open',
          this.cliInfo?.version ?? ''
        )
      : nls.localize(
          'arduino/claudeCode/statusOpen',
          'Open Claude Code'
        );
    this.statusBar.setElement(claudeStatusBarId, {
      text: '$(sparkle) Claude',
      alignment: StatusBarAlignment.RIGHT,
      priority: 1,
      tooltip,
      command: ClaudeCode.Commands.OPEN.id,
    });
  }
}

export namespace ClaudeCode {
  export namespace Commands {
    export const OPEN: Command = {
      id: 'arduino-claude-code-open',
      label: 'Open Claude Code',
      category: 'Claude',
    };
    export const NEW_SESSION: Command = {
      id: 'arduino-claude-code-new-session',
      label: 'New Session',
      category: 'Claude',
    };
    export const SEED_CONTEXT: Command = {
      id: 'arduino-claude-code-seed-context',
      label: 'Add Arduino Context File',
      category: 'Claude',
    };
  }
}
