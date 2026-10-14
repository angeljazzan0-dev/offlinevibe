import { Audio } from 'expo-av';

let soundObject: Audio.Sound | null = null;
let isPlayingInternal = false;

export const ExpoPlayer = {
  async setup() {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  },

  async loadAndPlay(uri: string) {
    if (soundObject) {
      await soundObject.unloadAsync();
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true }
    );
    soundObject = sound;
    isPlayingInternal = true;
  },

  async togglePlayPause(onStateChange?: (playing: boolean) => void) {
    if (!soundObject) return;
    if (isPlayingInternal) {
      await soundObject.pauseAsync();
      isPlayingInternal = false;
    } else {
      await soundObject.playAsync();
      isPlayingInternal = true;
    }
    onStateChange?.(isPlayingInternal);
  },
};