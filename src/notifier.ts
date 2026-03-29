import type { AppConfig } from "./config.js";
import { shouldNotifyState, shouldPlaySound } from "./config.js";
import type { NormalizedEvent } from "./events.js";
import { DesktopProvider, type DeliveryProvider, SoundProvider } from "./providers.js";

export interface NotifyResult {
  emitted: boolean;
  desktopSent: boolean;
  soundSent: boolean;
}

export interface EventStoreLike {
  shouldEmit(event: NormalizedEvent): Promise<boolean>;
  record(event: NormalizedEvent): Promise<void>;
}

export interface NotifierOptions {
  config: AppConfig;
  store: EventStoreLike;
  desktopProvider?: DeliveryProvider;
  soundProvider?: DeliveryProvider;
}

export class Notifier {
  private readonly config: AppConfig;
  private readonly store: EventStoreLike;
  private readonly desktopProvider: DeliveryProvider;
  private readonly soundProvider: DeliveryProvider;

  constructor(options: NotifierOptions) {
    this.config = options.config;
    this.store = options.store;
    this.desktopProvider =
      options.desktopProvider ?? new DesktopProvider({ platform: process.platform });
    this.soundProvider =
      options.soundProvider ??
      new SoundProvider({
        platform: process.platform,
        soundFile: this.config.soundFile,
        soundTheme: this.config.soundTheme,
        stateSoundFiles: {
          needs_input: this.config.soundFileNeedsInput,
          completed: this.config.soundFileCompleted,
          failed: this.config.soundFileFailed
        }
      });
  }

  async notify(event: NormalizedEvent): Promise<NotifyResult> {
    if (!(await this.store.shouldEmit(event))) {
      return {
        emitted: false,
        desktopSent: false,
        soundSent: false
      };
    }

    if (!shouldNotifyState(this.config, event.state)) {
      await this.store.record(event);
      return {
        emitted: true,
        desktopSent: false,
        soundSent: false
      };
    }

    const desktopSent = this.config.desktopEnabled
      ? await safeSend(this.desktopProvider, event)
      : false;
    const soundSent = shouldPlaySound(this.config, event.state)
      ? await safeSend(this.soundProvider, event)
      : false;

    await this.store.record(event);

    return {
      emitted: true,
      desktopSent,
      soundSent
    };
  }
}

async function safeSend(provider: DeliveryProvider, event: NormalizedEvent): Promise<boolean> {
  try {
    return Boolean(await provider.send(event));
  } catch {
    return false;
  }
}
