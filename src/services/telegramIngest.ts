import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import {
  LocalStore,
  TrackItem,
  GENRE_PRESETS,
  findClosestAcousticGroupId,
} from './localStore';

export interface IncomingAudioFile {
  originalFilename: string;
  sourceUri: string;
  fileSize?: number;
}

export function setupTelegramShareListener(
  onTrackIngested: (track: TrackItem) => void
): () => void {
  const handleUrl = async (url: string | null) => {
    if (!url) return;

    let filename = '';
    let sourceUri = url;

    if (url.startsWith('file://') || url.startsWith('content://')) {
      const decodedUrl = decodeURI(url);
      filename = decodedUrl.split('/').pop() || `audio_${Date.now()}.mp3`;
    } else {
      const decodedUrl = decodeURI(url);
      const parsed = Linking.parse(decodedUrl);
      if (parsed.scheme === 'offlinevibe' && parsed.hostname === 'import') {
        filename =
          (parsed.queryParams?.filename as string) || `telegram_${Date.now()}.mp3`;
        sourceUri = (parsed.queryParams?.sourceUri as string) || url;
      } else {
        return;
      }
    }

    if (sourceUri) {
      const track = await ingestAudioFile({
        originalFilename: filename,
        sourceUri,
      });
      if (track) {
        onTrackIngested(track);
      }
    }
  };

  const subscription = Linking.addEventListener('url', ({ url }) => {
    handleUrl(url);
  });

  Linking.getInitialURL().then(handleUrl);

  return () => subscription.remove();
}

export async function pickAndImportAudio(
  onTracksIngested: (lastTrack: TrackItem, totalImported: number) => void
): Promise<void> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/*'],
      copyToCacheDirectory: true,
      multiple: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    let lastTrack: TrackItem | null = null;
    let importedCount = 0;

    for (const asset of result.assets) {
      const track = await ingestAudioFile({
        originalFilename: asset.name,
        sourceUri: asset.uri,
        fileSize: asset.size,
      });
      if (track) {
        lastTrack = track;
        importedCount++;
      }
    }

    if (lastTrack && importedCount > 0) {
      onTracksIngested(lastTrack, importedCount);
    }
  } catch (err) {
    console.error('[Ingest] Error al abrir selector de archivos:', err);
    Alert.alert('Error', 'No se pudo acceder a los archivos de audio.');
  }
}

export async function ingestAudioFile(
  incoming: IncomingAudioFile
): Promise<TrackItem | null> {
  try {
    let persistentUri = incoming.sourceUri;

    try {
      const docDir = (FileSystem as any).documentDirectory as string | undefined;
      if (docDir) {
        const safeName = incoming.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const tracksDir = `${docDir}tracks/`;
        const destination = `${tracksDir}${Date.now()}_${safeName}`;

        const dirInfo = await FileSystem.getInfoAsync(tracksDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(tracksDir, { intermediates: true });
        }

        await FileSystem.copyAsync({
          from: incoming.sourceUri,
          to: destination,
        });
        persistentUri = destination;
      }
    } catch {
      persistentUri = incoming.sourceUri;
    }

    const groups = await LocalStore.getGroups();
    const meta = analyzeFilenameHeuristics(incoming.originalFilename);

    const groupId =
      meta.matchedKeyword && meta.defaultGroupId
        ? meta.defaultGroupId
        : findClosestAcousticGroupId(
            {
              energy: meta.energy,
              genreWeight: meta.genreWeight,
              tempoBpm: meta.bpm,
              popularity: 0.72,
            },
            groups
          );

    const matchedGroup = groups.find((g) => g.id === groupId);

    const newTrack: TrackItem = {
      id: `trk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      filename: incoming.originalFilename,
      filePath: persistentUri,
      fileSize: incoming.fileSize ?? 0,
      duration: 180,
      title: meta.title,
      artist: meta.artist,
      artistId: meta.artistId,
      album: matchedGroup ? matchedGroup.name : 'Offline Vibe',
      groupId,
      genre: meta.genre,
      energy: meta.energy,
      genreWeight: meta.genreWeight,
      tempoBpm: meta.bpm,
      popularity: 0.72,
      moodTags: meta.moodTags,
      needsEnrichment: !meta.matchedKeyword,
      playCount: 0,
      createdAt: Date.now(),
    };

    await LocalStore.upsertTrack(newTrack);
    return newTrack;
  } catch (error) {
    console.error('[Ingest] Error procesando pista:', error);
    return null;
  }
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}

function analyzeFilenameHeuristics(filename: string) {
  const clean = filename
    .replace(/\.(mp3|m4a|wav|aac|flac|ogg)$/i, '')
    .replace(/_/g, ' ')
    .trim();

  const parts = clean.split(/\s*-\s*/);
  let artist = 'Artista Local';
  let title = clean;

  if (parts.length >= 2) {
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }

  const artistId =
    artist.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'unknown_artist';
  const lower = clean.toLowerCase();
  const signature = hashString(clean);

  const bpmExplicit = lower.match(/\b([6-9]\d|1\d\d|200)\s*bpm\b/);

  let genre = 'Rock en Inglés';
  let matchedKeyword = false;
  const moodTags: string[] = [];

  if (
    /(dembow|lirico|atomic|alfa|rochy|chimbala|tokischa|jombriel|ryan castro|parte|choke|muevelo)/.test(
      lower
    )
  ) {
    genre = 'Dembow';
    matchedKeyword = true;
    moodTags.push('dembow', 'club');
  } else if (
    /(montagem|phonk|rubikdice|kordhell|drift|brazilian|krush)/.test(lower)
  ) {
    genre = 'Phonk & Montagem';
    matchedKeyword = true;
    moodTags.push('phonk', 'peak');
  } else if (
    /(trap|bryant myers|anuel|almighty|esclava|duki|eladio|ysy|hades|ovniz)/.test(
      lower
    )
  ) {
    genre = 'Trap Latino';
    matchedKeyword = true;
    moodTags.push('trap', 'bass');
  } else if (
    /(reggaeton|young cister|kreamly|qloo|arcangel|jezzy|justin quiles|bad bunny|feid|mora|rauw|jhayco|perreo)/.test(
      lower
    )
  ) {
    genre = 'Reggaeton';
    matchedKeyword = true;
    moodTags.push('urbano', 'perreo');
  } else if (
    /(menor3s|razzer|wapa|rap|hip hop|eminem|50 cent|canserbero|akapellah|kendrick|drake|travis)/.test(
      lower
    )
  ) {
    genre = 'Rap & Hip-Hop';
    matchedKeyword = true;
    moodTags.push('bars', 'rap');
  } else if (
    /(hard rock|metallica|acdc|guns n|slipknot|system of a down|disturbed|metal|iron maiden)/.test(
      lower
    )
  ) {
    genre = 'Hard Rock';
    matchedKeyword = true;
    moodTags.push('heavy', 'guitar');
  } else if (
    /(maneskin|måneskin|mammamia|damiano david|first time|muse|green day|killers|oasis|blur|radiohead|alternativo)/.test(
      lower
    )
  ) {
    genre = 'Rock Alternativo';
    matchedKeyword = true;
    moodTags.push('alt', 'rock');
  } else if (
    /(arctic monkeys|strokes|nirvana|linkin park|foo fighters|red hot|queen|led zeppelin|rock)/.test(
      lower
    )
  ) {
    genre = 'Rock en Inglés';
    matchedKeyword = true;
    moodTags.push('rock', 'classic');
  } else if (
    /(indie|neighbourhood|cage the elephant|interpol|gorillaz|post punk|smiths|cure)/.test(
      lower
    )
  ) {
    genre = 'Indie & Post-Punk';
    matchedKeyword = true;
    moodTags.push('indie');
  } else if (
    /(imagine dragons|coldplay|maroon 5|onerepublic|paramore|pop rock|pop)/.test(
      lower
    )
  ) {
    genre = 'Pop Rock';
    matchedKeyword = true;
    moodTags.push('melodic');
  } else {
    const allGenres = Object.keys(GENRE_PRESETS);
    genre = allGenres[signature % allGenres.length];
  }

  const preset = GENRE_PRESETS[genre] || GENRE_PRESETS['Rock en Inglés'];
  const energyVariation = ((signature % 19) - 9) / 10; // [-0.9, +0.9]
  const bpmVariation = (signature % 15) - 7;             // [-7, +7]

  const energy = Number(
    Math.min(9.9, Math.max(1.5, preset.energy + energyVariation)).toFixed(1)
  );
  const bpm = bpmExplicit
    ? parseInt(bpmExplicit[1], 10)
    : Math.min(190, Math.max(66, preset.bpm + bpmVariation));

  return {
    title,
    artist,
    artistId,
    genre,
    energy,
    genreWeight: preset.genreWeight,
    bpm,
    moodTags,
    matchedKeyword,
    defaultGroupId: preset.defaultGroupId,
  };
}