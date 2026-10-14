import AsyncStorage from '@react-native-async-storage/async-storage';

export type Vector4D = [number, number, number, number];

export interface TrackItem {
  id: string;
  filename: string;
  filePath: string;
  fileSize: number;
  duration: number;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  groupId: string;
  genre: string;
  energy: number;
  genreWeight: number;
  tempoBpm: number;
  popularity: number;
  moodTags: string[];
  needsEnrichment: boolean;
  playCount: number;
  lastPlayedAt?: number;
  createdAt: number;
}

export interface PlayHistoryItem {
  trackId: string;
  artistId: string;
  playedAt: number;
}

export interface AlbumGroup {
  id: string;
  name: string;
  subtitle: string;
  accentColor: string;
  targetEnergy: number;
  targetGenreWeight: number;
  targetBpm: number;
  isCustomNamed: boolean;
}

const STORAGE_KEY_TRACKS = '@offlinevibe_tracks_v5';
const STORAGE_KEY_HISTORY = '@offlinevibe_history_v5';
const STORAGE_KEY_GROUPS = '@offlinevibe_groups_v5';

// 10 Géneros calibrados según tu perfil musical real
export const GENRE_PRESETS: Record<
  string,
  { energy: number; genreWeight: number; bpm: number; defaultGroupId: string }
> = {
  'Rock en Inglés': {
    energy: 8.2,
    genreWeight: 0.32,
    bpm: 122,
    defaultGroupId: 'grp_rock_eng',
  },
  'Rock Alternativo': {
    energy: 7.6,
    genreWeight: 0.36,
    bpm: 118,
    defaultGroupId: 'grp_rock_eng',
  },
  'Hard Rock': {
    energy: 9.2,
    genreWeight: 0.4,
    bpm: 134,
    defaultGroupId: 'grp_rock_eng',
  },
  'Indie & Post-Punk': {
    energy: 6.4,
    genreWeight: 0.28,
    bpm: 110,
    defaultGroupId: 'grp_indie_pop',
  },
  'Pop Rock': {
    energy: 6.8,
    genreWeight: 0.46,
    bpm: 116,
    defaultGroupId: 'grp_indie_pop',
  },
  Dembow: {
    energy: 9.0,
    genreWeight: 0.88,
    bpm: 120,
    defaultGroupId: 'grp_dembow',
  },
  Reggaeton: {
    energy: 7.8,
    genreWeight: 0.76,
    bpm: 95,
    defaultGroupId: 'grp_reggaeton',
  },
  'Trap Latino': {
    energy: 7.4,
    genreWeight: 0.82,
    bpm: 140,
    defaultGroupId: 'grp_rap_trap',
  },
  'Rap & Hip-Hop': {
    energy: 7.1,
    genreWeight: 0.64,
    bpm: 92,
    defaultGroupId: 'grp_rap_trap',
  },
  'Phonk & Montagem': {
    energy: 9.5,
    genreWeight: 0.95,
    bpm: 132,
    defaultGroupId: 'grp_phonk',
  },
};

export const DEFAULT_ALBUM_GROUPS: AlbumGroup[] = [
  {
    id: 'grp_rock_eng',
    name: 'Rock & Guitarras',
    subtitle: 'Rock en Inglés • Alternativo • Hard Rock',
    accentColor: '#ef4444',
    targetEnergy: 8.3,
    targetGenreWeight: 0.35,
    targetBpm: 124,
    isCustomNamed: false,
  },
  {
    id: 'grp_dembow',
    name: 'Dembow & Club Alto',
    subtitle: 'Ritmo rápido • Bajos pesados • 118-124 BPM',
    accentColor: '#f59e0b',
    targetEnergy: 9.0,
    targetGenreWeight: 0.88,
    targetBpm: 120,
    isCustomNamed: false,
  },
  {
    id: 'grp_reggaeton',
    name: 'Reggaeton & Perreo',
    subtitle: 'Flujo urbano • 90-100 BPM',
    accentColor: '#8b5cf6',
    targetEnergy: 7.8,
    targetGenreWeight: 0.76,
    targetBpm: 95,
    isCustomNamed: false,
  },
  {
    id: 'grp_rap_trap',
    name: 'Rap, Barras & Trap',
    subtitle: 'Hip-Hop • Trap Latino • Cadencia lírica',
    accentColor: '#10b981',
    targetEnergy: 7.2,
    targetGenreWeight: 0.7,
    targetBpm: 112,
    isCustomNamed: false,
  },
  {
    id: 'grp_indie_pop',
    name: 'Indie & Melódico',
    subtitle: 'Indie Rock • Pop Rock • Vibra media',
    accentColor: '#3b82f6',
    targetEnergy: 6.5,
    targetGenreWeight: 0.38,
    targetBpm: 113,
    isCustomNamed: false,
  },
  {
    id: 'grp_phonk',
    name: 'Phonk & Montagem',
    subtitle: 'Energía máxima • Drift & Bass',
    accentColor: '#ec4899',
    targetEnergy: 9.4,
    targetGenreWeight: 0.94,
    targetBpm: 132,
    isCustomNamed: false,
  },
];

export function getNormalizedVector(t: {
  energy: number;
  genreWeight: number;
  tempoBpm: number;
  popularity: number;
}): Vector4D {
  return [
    Math.min(Math.max((t.energy - 1) / 9, 0), 1),
    Math.min(Math.max(t.genreWeight, 0), 1),
    Math.min(Math.max((t.tempoBpm - 60) / 140, 0), 1),
    Math.min(Math.max(t.popularity, 0), 1),
  ];
}

export function findClosestAcousticGroupId(
  track: Pick<TrackItem, 'energy' | 'genreWeight' | 'tempoBpm' | 'popularity'>,
  groups: AlbumGroup[]
): string {
  const pool = groups.length > 0 ? groups : DEFAULT_ALBUM_GROUPS;
  const trackVec = getNormalizedVector(track);

  let bestGroupId = pool[0].id;
  let bestDistance = Infinity;

  for (const grp of pool) {
    const grpVec = getNormalizedVector({
      energy: grp.targetEnergy,
      genreWeight: grp.targetGenreWeight,
      tempoBpm: grp.targetBpm,
      popularity: 0.75,
    });

    // Peso extra en genreWeight y energía para agrupar por textura musical
    const dEnergy = (trackVec[0] - grpVec[0]) * 1.1;
    const dGenre = (trackVec[1] - grpVec[1]) * 1.6;
    const dBpm = (trackVec[2] - grpVec[2]) * 0.9;
    const dist = Math.sqrt(dEnergy * dEnergy + dGenre * dGenre + dBpm * dBpm);

    if (dist < bestDistance) {
      bestDistance = dist;
      bestGroupId = grp.id;
    }
  }

  return bestGroupId;
}

export const LocalStore = {
  async getGroups(): Promise<AlbumGroup[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_GROUPS);
      if (!raw) {
        await AsyncStorage.setItem(
          STORAGE_KEY_GROUPS,
          JSON.stringify(DEFAULT_ALBUM_GROUPS)
        );
        return DEFAULT_ALBUM_GROUPS;
      }
      const parsed: AlbumGroup[] = JSON.parse(raw);
      return parsed.length > 0 ? parsed : DEFAULT_ALBUM_GROUPS;
    } catch {
      return DEFAULT_ALBUM_GROUPS;
    }
  },

  async saveGroups(groups: AlbumGroup[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify(groups));
    } catch (e) {
      console.error('[LocalStore] Error guardando grupos:', e);
    }
  },

  async renameGroup(groupId: string, newName: string): Promise<AlbumGroup[]> {
    const cleanName = newName.trim();
    const groups = await this.getGroups();
    if (!cleanName) return groups;

    const updated = groups.map((g) =>
      g.id === groupId ? { ...g, name: cleanName, isCustomNamed: true } : g
    );
    await this.saveGroups(updated);

    // Actualizar también la etiqueta de álbum en las pistas pertenecientes a este grupo
    const tracks = await this.getTracks();
    const updatedTracks = tracks.map((t) =>
      t.groupId === groupId ? { ...t, album: cleanName } : t
    );
    await this.saveTracks(updatedTracks);

    return updated;
  },

  async createGroup(name: string, baseGenre: string = 'Rock en Inglés'): Promise<AlbumGroup[]> {
    const cleanName = name.trim();
    const groups = await this.getGroups();
    if (!cleanName) return groups;

    const preset = GENRE_PRESETS[baseGenre] || GENRE_PRESETS['Rock en Inglés'];
    const palette = ['#8b5cf6', '#ef4444', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];
    const newGroup: AlbumGroup = {
      id: `grp_custom_${Date.now()}`,
      name: cleanName,
      subtitle: `Álbum personalizado • Base ${baseGenre}`,
      accentColor: palette[groups.length % palette.length],
      targetEnergy: preset.energy,
      targetGenreWeight: preset.genreWeight,
      targetBpm: preset.bpm,
      isCustomNamed: true,
    };

    const nextGroups = [...groups, newGroup];
    await this.saveGroups(nextGroups);
    return nextGroups;
  },

  async moveTrackToGroup(trackId: string, targetGroupId: string): Promise<TrackItem[]> {
    const [tracks, groups] = await Promise.all([this.getTracks(), this.getGroups()]);
    const targetGroup = groups.find((g) => g.id === targetGroupId);
    if (!targetGroup) return tracks;

    const updatedTracks = tracks.map((t) => {
      if (t.id !== trackId) return t;
      // Al mover manualmente una canción a un grupo, acercamos suavemente su vector al grupo
      const blendedEnergy = Number(
        (t.energy * 0.6 + targetGroup.targetEnergy * 0.4).toFixed(1)
      );
      const blendedWeight = Number(
        (t.genreWeight * 0.4 + targetGroup.targetGenreWeight * 0.6).toFixed(2)
      );
      return {
        ...t,
        groupId: targetGroup.id,
        album: targetGroup.name,
        energy: blendedEnergy,
        genreWeight: blendedWeight,
        needsEnrichment: false,
      };
    });

    await this.saveTracks(updatedTracks);
    return updatedTracks;
  },

  async getTracks(): Promise<TrackItem[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_TRACKS);
      if (!raw) return [];
      const tracks: TrackItem[] = JSON.parse(raw);
      const groups = await this.getGroups();

      // Garantizar que toda pista tenga un groupId válido
      let modified = false;
      const normalized = tracks.map((t) => {
        if (!t.groupId || !groups.some((g) => g.id === t.groupId)) {
          modified = true;
          const closestId = findClosestAcousticGroupId(t, groups);
          const grp = groups.find((g) => g.id === closestId);
          return {
            ...t,
            groupId: closestId,
            album: grp ? grp.name : t.album || 'Offline Vibe',
          };
        }
        return t;
      });

      if (modified) {
        await this.saveTracks(normalized);
      }
      return normalized;
    } catch {
      return [];
    }
  },

  async saveTracks(tracks: TrackItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_TRACKS, JSON.stringify(tracks));
    } catch (e) {
      console.error('[LocalStore] Error guardando pistas:', e);
    }
  },

  async upsertTrack(track: TrackItem): Promise<TrackItem[]> {
    const [tracks, groups] = await Promise.all([
      this.getTracks(),
      this.getGroups(),
    ]);

    const assignedGroupId =
      track.groupId || findClosestAcousticGroupId(track, groups);
    const assignedGroup = groups.find((g) => g.id === assignedGroupId);

    const trackWithGroup: TrackItem = {
      ...track,
      groupId: assignedGroupId,
      album: assignedGroup ? assignedGroup.name : track.album || 'Offline Vibe',
    };

    const index = tracks.findIndex(
      (t) =>
        t.id === trackWithGroup.id || t.filename === trackWithGroup.filename
    );

    if (index >= 0) {
      tracks[index] = { ...tracks[index], ...trackWithGroup };
    } else {
      tracks.push(trackWithGroup);
    }

    await this.saveTracks(tracks);
    return tracks;
  },

  async updateTrackFields(
    trackId: string,
    updates: Partial<TrackItem>
  ): Promise<TrackItem | null> {
    const [tracks, groups] = await Promise.all([
      this.getTracks(),
      this.getGroups(),
    ]);
    const index = tracks.findIndex((t) => t.id === trackId);
    if (index === -1) return null;

    const merged: TrackItem = {
      ...tracks[index],
      ...updates,
      needsEnrichment: false,
    };

    // Si cambió el género o la energía y no se especificó un groupId manual, re-evaluar grupo sugerido
    if ((updates.genre || updates.energy) && !updates.groupId) {
      const closestId = findClosestAcousticGroupId(merged, groups);
      const grp = groups.find((g) => g.id === closestId);
      merged.groupId = closestId;
      if (grp) merged.album = grp.name;
    }

    tracks[index] = merged;
    await this.saveTracks(tracks);
    return merged;
  },

  async deleteTrack(trackId: string): Promise<TrackItem[]> {
    const tracks = await this.getTracks();
    const filtered = tracks.filter((t) => t.id !== trackId);
    await this.saveTracks(filtered);
    return filtered;
  },

  async recordPlay(trackId: string): Promise<TrackItem | null> {
    const now = Date.now();
    const tracks = await this.getTracks();
    const index = tracks.findIndex((t) => t.id === trackId);
    if (index === -1) return null;

    const current = tracks[index];
    const nextPlayCount = (current.playCount || 0) + 1;
    const nextPopularity = Math.min(
      0.99,
      Number((current.popularity + 0.015).toFixed(3))
    );

    const updated: TrackItem = {
      ...current,
      playCount: nextPlayCount,
      popularity: nextPopularity,
      lastPlayedAt: now,
    };

    tracks[index] = updated;
    await this.saveTracks(tracks);

    try {
      const rawHistory = await AsyncStorage.getItem(STORAGE_KEY_HISTORY);
      const history: PlayHistoryItem[] = rawHistory ? JSON.parse(rawHistory) : [];
      history.unshift({
        trackId: updated.id,
        artistId: updated.artistId,
        playedAt: now,
      });
      await AsyncStorage.setItem(
        STORAGE_KEY_HISTORY,
        JSON.stringify(history.slice(0, 40))
      );
    } catch {
      // Ignorar fallo no crítico de historial
    }

    return updated;
  },

  async getRecentHistory(limit: number = 6): Promise<PlayHistoryItem[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_HISTORY);
      const history: PlayHistoryItem[] = raw ? JSON.parse(raw) : [];
      return history.slice(0, limit);
    } catch {
      return [];
    }
  },
};