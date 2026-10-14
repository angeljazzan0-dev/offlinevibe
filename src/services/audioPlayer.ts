import TrackPlayer, {
  Capability,
  AppKilledPlaybackBehavior,
  Event,
  Track as RNTrack,
} from 'react-native-track-player';
import { database } from '../database';
import Track from '../database/models/Track';
import PlayHistory from '../database/models/PlayHistory';
import { getNextRecommendedTrackIds } from './recommendation';

let isPlayerInitialized = false;

export async function initializeAudioPlayer(): Promise<void> {
  if (isPlayerInitialized) return;

  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
      waitForBuffer: true,
    });

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
      ],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
    });

    isPlayerInitialized = true;
    setupQueueEndListener();
  } catch (error) {
    console.error('[TrackPlayer] Error en setupPlayer:', error);
  }
}

export function mapTrackToPlayer(track: Track): RNTrack {
  return {
    id: track.id,
    url: track.filePath,
    title: track.title,
    artist: track.artist,
    album: track.album || 'Offline Vibe',
    duration: track.duration,
    genre: track.genre,
  };
}

export async function enqueueNextRecommendations(currentTrack: Track): Promise<void> {
  try {
    const nextIds = await getNextRecommendedTrackIds(currentTrack, { limit: 10 });
    if (nextIds.length === 0) return;

    const tracksCollection = database.get<Track>('tracks');
    const recommendedTracks = await Promise.all(
      nextIds.map((id) => tracksCollection.find(id))
    );

    const playerTracks = recommendedTracks.map(mapTrackToPlayer);
    await TrackPlayer.add(playerTracks);
  } catch (error) {
    console.error('[TrackPlayer] Error encolando recomendaciones:', error);
  }
}

function setupQueueEndListener(): void {
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
    if (event.track?.id) {
      const trackRecord = await database.get<Track>('tracks').find(event.track.id);
      if (trackRecord) {
        await database.write(async () => {
          await database.get<PlayHistory>('play_history').create((history) => {
            history.trackId = trackRecord.id;
            history.artistId = trackRecord.artistId;
            history.playedAt = Date.now();
          });
        });

        const queue = await TrackPlayer.getQueue();
        const currentIndex = await TrackPlayer.getActiveTrackIndex();
        if (currentIndex !== undefined && queue.length - currentIndex <= 2) {
          await enqueueNextRecommendations(trackRecord);
        }
      }
    }
  });
}