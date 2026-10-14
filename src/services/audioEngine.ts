import { Platform } from 'react-native';

export interface PlaybackStateUpdate {
  positionSeconds: number;
  durationSeconds: number;
  isPlaying: boolean;
  didJustFinish: boolean;
}

export interface LockScreenMetadata {
  title: string;
  artist: string;
  albumTitle?: string;
}

type StatusCallback = (status: PlaybackStateUpdate) => void;

class AudioEngineService {
  private player: any = null;
  private statusSubscription: any = null;
  private nextSubscription: any = null;
  private prevSubscription: any = null;
  private statusCallback: StatusCallback | null = null;
  private fallbackTimer: any = null;
  private simulatedPosition = 0;
  private simulatedDuration = 180;
  private isSimulatedPlaying = false;
  private currentUri: string | null = null;
  private lastFinishTimestamp = 0;

  public onRemoteNext: (() => void) | null = null;
  public onRemotePrevious: (() => void) | null = null;

  async init(): Promise<void> {
    try {
      const ExpoAudio = require('expo-audio');
      if (ExpoAudio?.setAudioModeAsync) {
        await ExpoAudio.setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
          interruptionModeAndroid: 'doNotMix',
          shouldRouteThroughEarpiece: false,
          allowsRecording: false,
        });
      }
    } catch {
      // Si el entorno está en arranque inicial, continúa en modo seguro
    }
  }

  async loadAndPlay(
    uri: string,
    autoPlay = true,
    onUpdate?: StatusCallback,
    metadata?: LockScreenMetadata
  ): Promise<void> {
    this.statusCallback = onUpdate || null;
    this.currentUri = uri;
    this.stopFallbackTimer();

    try {
      await this.init();
      const ExpoAudio = require('expo-audio');

      if (ExpoAudio?.createAudioPlayer) {
        if (!this.player) {
          this.player = ExpoAudio.createAudioPlayer({ uri });
          this.attachPlayerListeners();
        } else if (typeof this.player.replace === 'function') {
          this.player.replace({ uri });
        } else {
          this.cleanupPlayerInstance();
          this.player = ExpoAudio.createAudioPlayer({ uri });
          this.attachPlayerListeners();
        }

        this.syncLockScreenControls(metadata);

        if (autoPlay) {
          this.player.play?.();
          // Reforzar metadatos en MPNowPlayingInfoCenter tras iniciar reproducción en iOS
          setTimeout(() => {
            this.syncLockScreenControls(metadata);
          }, 250);
        } else {
          this.player.pause?.();
        }
        return;
      }
    } catch (e) {
      console.warn('[AudioEngine] Fallback nativo activo:', e);
    }

    // Modo simulación acústica para pruebas si el reproductor nativo está ocupado
    this.simulatedPosition = 0;
    this.simulatedDuration = 210;
    this.isSimulatedPlaying = autoPlay;
    this.startFallbackLoop();
  }

  private attachPlayerListeners(): void {
    if (!this.player) return;

    try {
      this.statusSubscription?.remove?.();
      this.statusSubscription = this.player.addListener?.(
        'playbackStatusUpdate',
        (status: any) => {
          if (!this.statusCallback) return;

          const pos = Math.max(0, Math.floor(status.currentTime || 0));
          const dur = Math.max(1, Math.floor(status.duration || 180));
          const playing = Boolean(status.playing);

          let finished = Boolean(status.didJustFinish);
          if (finished) {
            const now = Date.now();
            if (now - this.lastFinishTimestamp < 700) {
              finished = false;
            } else {
              this.lastFinishTimestamp = now;
            }
          }

          this.statusCallback({
            positionSeconds: pos,
            durationSeconds: dur,
            isPlaying: playing,
            didJustFinish: finished,
          });
        }
      );

      this.nextSubscription?.remove?.();
      this.nextSubscription = this.player.addListener?.(
        'onRemoteNextTrack',
        () => {
          this.onRemoteNext?.();
        }
      );

      this.prevSubscription?.remove?.();
      this.prevSubscription = this.player.addListener?.(
        'onRemotePreviousTrack',
        () => {
          this.onRemotePrevious?.();
        }
      );
    } catch {}
  }

  public syncLockScreenControls(metadata?: LockScreenMetadata): void {
    if (!this.player) return;
    const metaPayload = {
      title: metadata?.title || 'Offline Vibe',
      artist: metadata?.artist || 'Artista Local',
      albumTitle: metadata?.albumTitle || 'Offline Vibe',
    };

    try {
      if (typeof this.player.setActiveForLockScreen === 'function') {
        this.player.setActiveForLockScreen(true, metaPayload, {
          showSeekForward: true,
          showSeekBackward: true,
          showNextTrack: true,
          showPreviousTrack: true,
        });
      }
      if (typeof this.player.updateLockScreenMetadata === 'function') {
        this.player.updateLockScreenMetadata(metaPayload);
      }
    } catch {}
  }

  async play(): Promise<void> {
    if (this.player?.play) {
      try {
        await this.init();
        this.player.play();
        return;
      } catch {}
    }
    this.isSimulatedPlaying = true;
    this.startFallbackLoop();
  }

  async pause(): Promise<void> {
    if (this.player?.pause) {
      try {
        this.player.pause();
        return;
      } catch {}
    }
    this.isSimulatedPlaying = false;
    this.stopFallbackTimer();
    this.emitSimulatedUpdate(false);
  }

  async seek(seconds: number): Promise<void> {
    if (this.player?.seekTo) {
      try {
        this.player.seekTo(seconds);
        return;
      } catch {}
    }
    this.simulatedPosition = Math.max(0, seconds);
    this.emitSimulatedUpdate(this.isSimulatedPlaying);
  }

  private cleanupPlayerInstance(): void {
    if (this.player) {
      try {
        this.statusSubscription?.remove?.();
        this.nextSubscription?.remove?.();
        this.prevSubscription?.remove?.();
        this.player.clearLockScreenControls?.();
        this.player.pause?.();
        this.player.release?.();
        this.player.remove?.();
      } catch {}
      this.player = null;
      this.statusSubscription = null;
      this.nextSubscription = null;
      this.prevSubscription = null;
    }
  }

  async unload(): Promise<void> {
    this.stopFallbackTimer();
    this.cleanupPlayerInstance();
    this.statusCallback = null;
    this.currentUri = null;
  }

  private startFallbackLoop() {
    this.stopFallbackTimer();
    this.fallbackTimer = setInterval(() => {
      if (!this.isSimulatedPlaying) return;
      this.simulatedPosition += 1;
      const finished = this.simulatedPosition >= this.simulatedDuration;
      this.emitSimulatedUpdate(finished);
      if (finished) {
        this.simulatedPosition = 0;
        this.isSimulatedPlaying = false;
        this.stopFallbackTimer();
      }
    }, 1000);
  }

  private stopFallbackTimer() {
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private emitSimulatedUpdate(didJustFinish = false) {
    if (this.statusCallback) {
      this.statusCallback({
        positionSeconds: this.simulatedPosition,
        durationSeconds: this.simulatedDuration,
        isPlaying: this.isSimulatedPlaying,
        didJustFinish,
      });
    }
  }
}

export const AudioEngine = new AudioEngineService();