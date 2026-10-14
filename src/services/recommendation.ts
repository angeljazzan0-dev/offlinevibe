import {
  LocalStore,
  TrackItem,
  Vector4D,
  GENRE_PRESETS,
  getNormalizedVector,
} from './localStore';

export interface RecommendationConfig {
  limit?: number;
  energyTolerance?: number;
  artistPenaltyMultiplier?: number;
  recentArtistsWindow?: number;
}

export interface RecommendedTrackResult {
  track: TrackItem;
  affinityScore: number;
  energyDelta: number;
  isPenalized: boolean;
}

export interface SearchTrackResult {
  track: TrackItem;
  matchType: 'exact' | 'acoustic';
  affinityScore: number;
}

export function euclideanDistance(v1: Vector4D, v2: Vector4D): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function cosineSimilarity(v1: Vector4D, v2: Vector4D): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < 4; i++) {
    dotProduct += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return Math.max(0, Math.min(1, dotProduct / denominator));
}

export function computeHybridSimilarity(v1: Vector4D, v2: Vector4D): number {
  const MAX_DIST_4D = 2.0;
  const cosSim = cosineSimilarity(v1, v2);
  const eucDist = euclideanDistance(v1, v2);
  const eucSim = Math.max(0, 1 - eucDist / MAX_DIST_4D);
  return cosSim * 0.7 + eucSim * 0.3;
}

export async function getNextRecommendedTracks(
  seedTrack: TrackItem,
  config: RecommendationConfig = {}
): Promise<RecommendedTrackResult[]> {
  const {
    limit = 10,
    energyTolerance = 2.0,
    artistPenaltyMultiplier = 0.35,
    recentArtistsWindow = 2,
  } = config;

  const allTracks = await LocalStore.getTracks();
  const pool = allTracks.filter((t) => t.id !== seedTrack.id);

  if (pool.length === 0) return [];

  const minEnergy = Math.max(1.0, seedTrack.energy - energyTolerance);
  const maxEnergy = Math.min(10.0, seedTrack.energy + energyTolerance);

  // Filtro heurístico primario: Δ Energía <= 2.0
  let candidates = pool.filter(
    (t) => t.energy >= minEnergy && t.energy <= maxEnergy
  );

  // Si la biblioteca es pequeña y no llena el cupo, relajar el filtro
  if (candidates.length < Math.min(limit, pool.length)) {
    candidates = pool;
  }

  const history = await LocalStore.getRecentHistory(6);
  const recentArtistIds = history
    .slice(0, recentArtistsWindow)
    .map((h) => h.artistId)
    .filter((id) => id && id !== 'unknown_artist');

  const recentTrackIds = history.slice(0, 3).map((h) => h.trackId);
  const seedVector = getNormalizedVector(seedTrack);

  const scored = candidates.map((candidate) => {
    const candidateVector = getNormalizedVector(candidate);
    const baseSimilarity = computeHybridSimilarity(seedVector, candidateVector);

    // Bonificación sutil si pertenecen al mismo grupo acústico
    const sameGroupBonus =
      candidate.groupId === seedTrack.groupId ? 1.06 : 1.0;

    const isArtistPenalized =
      candidate.artistId !== 'unknown_artist' &&
      (candidate.artistId === seedTrack.artistId ||
        recentArtistIds.includes(candidate.artistId));

    const isRecentlyPlayed = recentTrackIds.includes(candidate.id);

    let finalScore = baseSimilarity * sameGroupBonus;
    if (isArtistPenalized) finalScore *= artistPenaltyMultiplier;
    if (isRecentlyPlayed) finalScore *= 0.55;

    return {
      track: candidate,
      affinityScore: Math.max(0.05, Math.min(0.99, finalScore)),
      rawSimilarity: baseSimilarity,
      energyDelta: Number(
        Math.abs(seedTrack.energy - candidate.energy).toFixed(1)
      ),
      isPenalized: isArtistPenalized,
    };
  });

  scored.sort((a, b) => {
    if (Math.abs(b.affinityScore - a.affinityScore) > 0.001) {
      return b.affinityScore - a.affinityScore;
    }
    return b.rawSimilarity - a.rawSimilarity;
  });

  return scored.slice(0, limit);
}

/**
 * Buscador híbrido:
 * 1. Primero devuelve todas las coincidencias de texto ordenadas alfabéticamente.
 * 2. Después (cuando ya no hay coincidencias alfabéticas), devuelve el resto de la biblioteca
 *    ordenado por similitud musical 4D respecto al primer match o respecto al género buscado.
 */
export function searchTracksWithAcousticFallback(
  query: string,
  allTracks: TrackItem[],
  activeMoodFilter: string | null = null,
  referenceTrack: TrackItem | null = null
): SearchTrackResult[] {
  let baseList = [...allTracks];

  // Si hay un filtro de vibra/género activo en la parte superior
  if (activeMoodFilter && activeMoodFilter !== 'Todos') {
    if (activeMoodFilter === 'Actívate') {
      baseList = baseList.filter((t) => t.energy >= 8.0);
    } else if (activeMoodFilter === 'Rock') {
      baseList = baseList.filter(
        (t) =>
          t.genre.toLowerCase().includes('rock') ||
          t.genre.toLowerCase().includes('indie') ||
          t.groupId === 'grp_rock_eng'
      );
    } else if (activeMoodFilter === 'Urbano & Dembow') {
      baseList = baseList.filter((t) =>
        ['Dembow', 'Reggaeton', 'Trap Latino'].includes(t.genre)
      );
    } else if (activeMoodFilter === 'Rap & Barras') {
      baseList = baseList.filter(
        (t) => t.genre === 'Rap & Hip-Hop' || t.genre === 'Trap Latino'
      );
    } else if (activeMoodFilter === 'Relajación') {
      baseList = baseList.filter((t) => t.energy <= 6.8);
    }
  }

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return baseList
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((track) => ({
        track,
        matchType: 'exact',
        affinityScore: 1,
      }));
  }

  const exactMatches: TrackItem[] = [];
  const remainingTracks: TrackItem[] = [];

  for (const track of baseList) {
    const haystack =
      `${track.title} ${track.artist} ${track.genre} ${track.album}`.toLowerCase();
    if (haystack.includes(trimmed)) {
      exactMatches.push(track);
    } else {
      remainingTracks.push(track);
    }
  }

  // Ordenar coincidencias de texto alfabéticamente
  exactMatches.sort((a, b) => a.title.localeCompare(b.title));

  // Determinar el vector ancla para ordenar las recomendaciones acústicas
  let anchorVector: Vector4D;
  if (exactMatches.length > 0) {
    anchorVector = getNormalizedVector(exactMatches[0]);
  } else {
    // Si escribió el nombre aproximado de un género o estado de ánimo sin match literal
    const matchedPresetKey = Object.keys(GENRE_PRESETS).find((k) =>
      k.toLowerCase().includes(trimmed)
    );
    if (matchedPresetKey) {
      const p = GENRE_PRESETS[matchedPresetKey];
      anchorVector = getNormalizedVector({
        energy: p.energy,
        genreWeight: p.genreWeight,
        tempoBpm: p.bpm,
        popularity: 0.75,
      });
    } else if (referenceTrack) {
      anchorVector = getNormalizedVector(referenceTrack);
    } else if (allTracks.length > 0) {
      anchorVector = getNormalizedVector(allTracks[0]);
    } else {
      anchorVector = [0.7, 0.5, 0.5, 0.7];
    }
  }

  const acousticMatches: SearchTrackResult[] = remainingTracks
    .map((track) => {
      const sim = computeHybridSimilarity(
        anchorVector,
        getNormalizedVector(track)
      );
      return {
        track,
        matchType: 'acoustic' as const,
        affinityScore: Math.max(0.1, Math.min(0.99, sim)),
      };
    })
    .sort((a, b) => b.affinityScore - a.affinityScore);

  const exactResults: SearchTrackResult[] = exactMatches.map((track) => ({
    track,
    matchType: 'exact' as const,
    affinityScore: 1.0,
  }));

  return [...exactResults, ...acousticMatches];
}