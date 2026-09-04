import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { Sketch } from '../../common/protocol';
import { BoardsServiceProvider } from '../boards/boards-service-provider';
import {
  CurrentSketch,
  SketchesServiceClientImpl,
} from '../sketches-service-client-impl';
import { WorkspaceService } from '../theia/workspace/workspace-service';

/**
 * Everything we managed to scrape together about the user's current Arduino
 * situation, ready to be handed to a Claude Code session.
 */
export interface ResolvedClaudeContext {
  /** Filesystem path the CLI should be launched in. Sketch folder if we have one. */
  readonly cwd: string | undefined;
  /** Extra environment variables describing the Arduino project. */
  readonly env: Record<string, string>;
  readonly sketch: Sketch | undefined;
  readonly fqbn: string | undefined;
  readonly boardName: string | undefined;
  readonly port: string | undefined;
}

@injectable()
export class ClaudeCodeContext {
  @inject(SketchesServiceClientImpl)
  private readonly sketchServiceClient: SketchesServiceClientImpl;

  @inject(BoardsServiceProvider)
  private readonly boardsServiceProvider: BoardsServiceProvider;

  @inject(WorkspaceService)
  private readonly workspaceService: WorkspaceService;

  @inject(FileService)
  private readonly fileService: FileService;

  async resolve(): Promise<ResolvedClaudeContext> {
    const sketch = await this.currentSketch();
    const { selectedBoard, selectedPort } =
      this.boardsServiceProvider.boardsConfig;

    const fqbn = selectedBoard?.fqbn;
    const boardName = selectedBoard?.name;
    const port = selectedPort?.address;
    const portProtocol = selectedPort?.protocol;

    const cwd = this.resolveCwd(sketch);

    const env: Record<string, string> = { ARDUINO_IDE: '1' };
    if (sketch) {
      env.ARDUINO_SKETCH_NAME = sketch.name;
      env.ARDUINO_SKETCH_PATH = new URI(sketch.uri).path.fsPath();
      env.ARDUINO_SKETCH_MAIN_FILE = new URI(sketch.mainFileUri).path.fsPath();
    }
    if (fqbn) {
      env.ARDUINO_FQBN = fqbn;
    }
    if (boardName) {
      env.ARDUINO_BOARD_NAME = boardName;
    }
    if (port) {
      env.ARDUINO_PORT = port;
    }
    if (portProtocol) {
      env.ARDUINO_PORT_PROTOCOL = portProtocol;
    }

    return { cwd, env, sketch, fqbn, boardName, port };
  }

  private resolveCwd(sketch: Sketch | undefined): string | undefined {
    if (sketch) {
      return new URI(sketch.uri).path.fsPath();
    }
    const roots = this.workspaceService.tryGetRoots();
    if (roots.length) {
      return roots[0].resource.path.fsPath();
    }
    return undefined;
  }

  private async currentSketch(): Promise<Sketch | undefined> {
    const sketch = await this.sketchServiceClient.currentSketch();
    return CurrentSketch.isValid(sketch) ? sketch : undefined;
  }

  /**
   * Drops a `CLAUDE.md` primer into the sketch folder if one isn't already
   * there. We never clobber an existing file — the user's notes win.
   */
  async seedClaudeMd(
    context: ResolvedClaudeContext
  ): Promise<'created' | 'exists' | 'no-sketch'> {
    if (!context.sketch) {
      return 'no-sketch';
    }
    const target = new URI(context.sketch.uri).resolve('CLAUDE.md');
    if (await this.fileService.exists(target)) {
      return 'exists';
    }
    await this.fileService.createFile(
      target,
      BinaryBuffer.fromString(this.buildClaudeMd(context))
    );
    return 'created';
  }

  /**
   * A primer we can drop into the sketch folder so a fresh Claude Code session
   * knows it's poking at an Arduino project and not some generic C++ pile.
   */
  buildClaudeMd(context: ResolvedClaudeContext): string {
    const lines: string[] = [];
    lines.push('# Project context for Claude Code');
    lines.push('');
    lines.push(
      'This folder is an **Arduino sketch** opened in Octo Agent. The IDE'
    );
    lines.push(
      'generated this primer automatically — tweak or delete it as you see fit.'
    );
    lines.push('');
    lines.push('## What you are looking at');
    lines.push('');
    lines.push(
      '- `*.ino` files are Arduino sketches. They are C++ under the hood, but the'
    );
    lines.push(
      '  toolchain prepends prototypes and includes `Arduino.h`, so the usual'
    );
    lines.push(
      '  `setup()` / `loop()` entry points stand in for `main()`.'
    );
    lines.push(
      '- All `.ino` files in the folder are concatenated into a single'
    );
    lines.push('  translation unit, in alphabetical order after the main file.');
    if (context.sketch) {
      lines.push(`- Sketch name: \`${context.sketch.name}\``);
    }
    lines.push('');
    lines.push('## Target');
    lines.push('');
    lines.push(
      `- Board: ${context.boardName ?? '_none selected_'}${
        context.fqbn ? ` (FQBN \`${context.fqbn}\`)` : ''
      }`
    );
    lines.push(`- Port: ${context.port ?? '_none selected_'}`);
    lines.push('');
    lines.push('## Building & uploading from the CLI');
    lines.push('');
    lines.push(
      'The IDE drives `arduino-cli`. If you need to compile or upload yourself:'
    );
    lines.push('');
    lines.push('```sh');
    const fqbnArg = context.fqbn ? context.fqbn : '<fqbn>';
    const portArg = context.port ? context.port : '<port>';
    lines.push(`arduino-cli compile --fqbn ${fqbnArg} .`);
    lines.push(`arduino-cli upload --fqbn ${fqbnArg} --port ${portArg} .`);
    lines.push('```');
    lines.push('');
    lines.push(
      'Prefer the IDE buttons for the normal flow — they keep board options and'
    );
    lines.push('the selected port in sync. Reach for the CLI when scripting.');
    lines.push('');
    return lines.join('\n');
  }
}
