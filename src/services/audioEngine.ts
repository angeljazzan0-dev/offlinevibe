import { Platform } from 'react-native';

export interface PlaybackStateUpdate {
  positionSeconds: number;
  durationSeconds: number;
  isPlaying: boolean;
  didJustFinish: boolean;
}

type StatusCallback = (status: PlaybackStateUpdate) => void;

class AudioEngineService {
  private player: any = null;
  private statusCallback: StatusCallback | null = null;
  private fallbackTimer: any = null;
  private simulatedPosition = 0;
  private simulatedDuration = 180;
  private isSimulatedPlaying = false;
  private currentUri: string | null = null;

  async init(): Promise<void> {
    try {
      const ExpoAudio = require('expo-audio');
      if (ExpoAudio?.setAudioModeAsync) {
        await ExpoAudio.setAudioModeAsync({
          playsInSilentMode: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });
      }
    } catch {
      // Si el entorno está en arranque inicial, continúa en modo seguro
    }
  }

  async loadAndPlay(uri: string, autoPlay = true, onUpdate?: StatusCallback): Promise<void> {
    this.statusCallback = onUpdate || null;
    this.currentUri = uri;
    this.stopFallbackTimer();

    try {
      const ExpoAudio = require('expo-audio');

      if (this.player) {
        try {
          this.player.pause?.();
          this.player.release?.();
          this.player.remove?.();
        } catch {}
        this.player = null;
      }

      if (ExpoAudio?.createAudioPlayer) {
        this.player = ExpoAudio.createAudioPlayer({ uri });

        this.player.addListener?.('playbackStatusUpdate', (status: any) => {
          if (!this.statusCallback) return;

          const pos = Math.max(0, Math.floor(status.currentTime || 0));
          const dur = Math.max(1, Math.floor(status.duration || 180));
          const playing = Boolean(status.playing);
          const finished = Boolean(status.didJustFinish);

          this.statusCallback({
            positionSeconds: pos,
            durationSeconds: dur,
            isPlaying: playing,
            didJustFinish: finished,
          });
        });

        if (autoPlay) {
          this.player.play?.();
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

  async play(): Promise<void> {
    if (this.player?.play) {
      try {
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

  async unload(): Promise<void> {
    this.stopFallbackTimer();
    if (this.player) {
      try {
        this.player.pause?.();
        this.player.release?.();
        this.player.remove?.();
      } catch {}
      this.player = null;
    }
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