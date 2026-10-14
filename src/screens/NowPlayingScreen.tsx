import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Dimensions,
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  Platform,
  TextInput,
  FlatList,
  ScrollView,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AcousticVectorBadge } from '../components/AcousticVectorBadge';
import { DynamicIslandPreview } from '../components/DynamicIslandWidget';
import { InfiniteQueueModal } from '../components/InfiniteQueueModal';
import {
  pickAndImportAudio,
  setupTelegramShareListener,
} from '../services/telegramIngest';
import {
  LocalStore,
  TrackItem,
  AlbumGroup,
  GENRE_PRESETS,
} from '../services/localStore';
import {
  getNextRecommendedTracks,
  RecommendedTrackResult,
  searchTracksWithAcousticFallback,
} from '../services/recommendation';
import { AudioEngine } from '../services/audioEngine';

const { width } = Dimensions.get('window');
const MONO_FONT = Platform.select({ ios: 'Courier', android: 'monospace' });
const MOOD_FILTERS = [
  'Todos',
  'Actívate',
  'Rock',
  'Urbano & Dembow',
  'Rap & Barras',
  'Relajación',
];

export const NowPlayingScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  const queueRef = useRef<RecommendedTrackResult[]>([]);
  const historyStackRef = useRef<TrackItem[]>([]);
  const currentTrackRef = useRef<TrackItem | null>(null);
  const loadRequestIdRef = useRef<number>(0);

  // Navegación inferior de 3 pestañas: Izquierda (search), Centro (player), Derecha (groups)
  const [activeBottomTab, setActiveBottomTab] = useState<
    'search' | 'player' | 'groups'
  >('player');

  // Estados del reproductor
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(1);
  const [scrubberWidth, setScrubberWidth] = useState(width - 48);
  const [currentTrack, setCurrentTrack] = useState<TrackItem | null>(null);
  const [queue, setQueue] = useState<RecommendedTrackResult[]>([]);
  const [allTracks, setAllTracks] = useState<TrackItem[]>([]);
  const [groups, setGroups] = useState<AlbumGroup[]>([]);
  const [isQueueVisible, setIsQueueVisible] = useState(false);

  // Estados de la pestaña izquierda (Buscador Híbrido)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMood, setSelectedMood] = useState<string>('Todos');

  // Estados de la pestaña derecha (Álbumes / Grupos y Modales de edición)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<AlbumGroup | null>(null);
  const [renameInputText, setRenameInputText] = useState('');
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [newGroupNameText, setNewGroupNameText] = useState('');
  const [trackToMove, setTrackToMove] = useState<TrackItem | null>(null);

  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (isPlaying) {
      spinAnim.setValue(0);
      animation = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 8500,
          useNativeDriver: true,
        })
      );
      animation.start();
    } else {
      spinAnim.stopAnimation();
    }
    return () => animation?.stop();
  }, [isPlaying]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    AudioEngine.init().catch(() => {});
    initData();

    const removeListener = setupTelegramShareListener(async (track) => {
      await reloadAllData();
      loadTrack(track, true, true);
    });

    return () => {
      removeListener();
      AudioEngine.unload().catch(() => {});
    };
  }, []);

  const initData = async () => {
    const [loadedGroups, loadedTracks] = await Promise.all([
      LocalStore.getGroups(),
      LocalStore.getTracks(),
    ]);
    setGroups(loadedGroups);
    setAllTracks(loadedTracks);

    if (loadedTracks.length > 0 && !currentTrackRef.current) {
      await loadTrack(loadedTracks[0], false, false);
    }
  };

  const reloadAllData = async () => {
    const [loadedGroups, loadedTracks] = await Promise.all([
      LocalStore.getGroups(),
      LocalStore.getTracks(),
    ]);
    setGroups(loadedGroups);
    setAllTracks(loadedTracks);
    if (currentTrackRef.current) {
      const updatedCurrent = loadedTracks.find(
        (t) => t.id === currentTrackRef.current?.id
      );
      if (updatedCurrent) {
        currentTrackRef.current = updatedCurrent;
        setCurrentTrack(updatedCurrent);
      }
    }
  };

  const recalculateQueue = async (seed: TrackItem) => {
    const nextRecommendations = await getNextRecommendedTracks(seed, {
      limit: 10,
    });
    queueRef.current = nextRecommendations;
    setQueue(nextRecommendations);
  };

  const loadTrack = async (
    track: TrackItem,
    autoPlay = true,
    pushHistory = true
  ) => {
    const requestId = ++loadRequestIdRef.current;

    try {
      if (
        pushHistory &&
        currentTrackRef.current &&
        currentTrackRef.current.id !== track.id
      ) {
        historyStackRef.current.unshift(currentTrackRef.current);
        historyStackRef.current = historyStackRef.current.slice(0, 25);
      }

      const playedTrack = (await LocalStore.recordPlay(track.id)) || track;
      if (requestId !== loadRequestIdRef.current) return;

      currentTrackRef.current = playedTrack;
      setCurrentTrack(playedTrack);
      setPosition(0);
      setDuration(Math.max(1, playedTrack.duration || 180));
      setIsPlaying(autoPlay);

      await AudioEngine.loadAndPlay(
        playedTrack.filePath,
        autoPlay,
        async (update) => {
          if (requestId !== loadRequestIdRef.current) return;

          setPosition(update.positionSeconds);
          if (update.durationSeconds > 1) {
            setDuration(update.durationSeconds);
            if (Math.abs(update.durationSeconds - playedTrack.duration) > 3) {
              playedTrack.duration = update.durationSeconds;
              await LocalStore.updateTrackFields(playedTrack.id, {
                duration: update.durationSeconds,
              });
            }
          }
          setIsPlaying(update.isPlaying);

          if (update.didJustFinish) {
            advanceToNextInQueue();
          }
        },
        {
          title: playedTrack.title,
          artist: playedTrack.artist,
          albumTitle: playedTrack.album || 'Offline Vibe',
        }
      );

      await reloadAllData();
      await recalculateQueue(playedTrack);
    } catch (error) {
      console.error('[Player] Error cargando pista:', error);
      setIsPlaying(false);
    }
  };

  const advanceToNextInQueue = async () => {
    if (queueRef.current.length > 0) {
      const nextCandidate = queueRef.current[0].track;
      await loadTrack(nextCandidate, true, true);
    } else {
      await AudioEngine.seek(0);
      await AudioEngine.pause();
      setIsPlaying(false);
    }
  };

  const triggerAudioImport = () => {
    pickAndImportAudio(async (lastTrack) => {
      await reloadAllData();
      await loadTrack(lastTrack, true, true);
    });
  };

  const togglePlayPause = async () => {
    if (!currentTrackRef.current) {
      if (allTracks.length > 0) {
        await loadTrack(allTracks[0], true, false);
      } else {
        triggerAudioImport();
      }
      return;
    }

    if (isPlaying) {
      await AudioEngine.pause();
      setIsPlaying(false);
    } else {
      await AudioEngine.play();
      setIsPlaying(true);
    }
  };

  const skipNext = async () => {
    if (queueRef.current.length > 0) {
      await loadTrack(queueRef.current[0].track, true, true);
    }
  };

  const skipPrevious = async () => {
    if (position > 3) {
      await AudioEngine.seek(0);
      setPosition(0);
      return;
    }

    if (historyStackRef.current.length > 0) {
      const previous = historyStackRef.current.shift()!;
      await loadTrack(previous, true, false);
    } else {
      await AudioEngine.seek(0);
      setPosition(0);
    }
  };

  // Enlazar eventos remotos de la Isla Dinámica / Pantalla de bloqueo
  AudioEngine.onRemoteNext = skipNext;
  AudioEngine.onRemotePrevious = skipPrevious;

  const handleSeek = async (e: GestureResponderEvent) => {
    if (duration <= 1) return;
    const tapX = e.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, tapX / scrubberWidth));
    const targetSeconds = Math.floor(ratio * duration);
    setPosition(targetSeconds);
    await AudioEngine.seek(targetSeconds);
  };

  const handleCycleGenre = async () => {
    if (!currentTrack) return;
    const genres = Object.keys(GENRE_PRESETS);
    const currentIndex = genres.indexOf(currentTrack.genre);
    const nextIdx = (currentIndex + 1) % genres.length;
    const nextGenre = genres[nextIdx];
    const preset = GENRE_PRESETS[nextGenre];

    const updated = await LocalStore.updateTrackFields(currentTrack.id, {
      genre: nextGenre,
      energy: preset.energy,
      genreWeight: preset.genreWeight,
      tempoBpm: preset.bpm,
    });

    if (updated) {
      currentTrackRef.current = updated;
      setCurrentTrack(updated);
      AudioEngine.syncLockScreenControls({
        title: updated.title,
        artist: updated.artist,
        albumTitle: updated.album,
      });
      await reloadAllData();
      await recalculateQueue(updated);
    }
  };

  const handleAdjustEnergy = async (delta: number) => {
    if (!currentTrack) return;
    const nextEnergy = Number(
      Math.min(10.0, Math.max(1.0, currentTrack.energy + delta)).toFixed(1)
    );

    const updated = await LocalStore.updateTrackFields(currentTrack.id, {
      energy: nextEnergy,
    });

    if (updated) {
      currentTrackRef.current = updated;
      setCurrentTrack(updated);
      await reloadAllData();
      await recalculateQueue(updated);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    const remaining = await LocalStore.deleteTrack(trackId);
    setAllTracks(remaining);

    if (currentTrackRef.current?.id === trackId) {
      await AudioEngine.unload();
      currentTrackRef.current = null;
      setCurrentTrack(null);
      setIsPlaying(false);
      setPosition(0);

      if (remaining.length > 0) {
        await loadTrack(remaining[0], false, false);
      } else {
        queueRef.current = [];
        setQueue([]);
      }
    } else if (currentTrackRef.current) {
      await recalculateQueue(currentTrackRef.current);
    }
  };

  const handleConfirmRenameGroup = async () => {
    if (!renamingGroup || !renameInputText.trim()) {
      setRenamingGroup(null);
      return;
    }
    await LocalStore.renameGroup(renamingGroup.id, renameInputText);
    setRenamingGroup(null);
    setRenameInputText('');
    await reloadAllData();
  };

  const handleConfirmCreateGroup = async () => {
    if (!newGroupNameText.trim()) {
      setIsNewGroupModalOpen(false);
      return;
    }
    await LocalStore.createGroup(
      newGroupNameText,
      currentTrack?.genre || 'Rock en Inglés'
    );
    setNewGroupNameText('');
    setIsNewGroupModalOpen(false);
    await reloadAllData();
  };

  const handleMoveTrackToGroup = async (targetGroupId: string) => {
    if (!trackToMove) return;
    await LocalStore.moveTrackToGroup(trackToMove.id, targetGroupId);
    setTrackToMove(null);
    await reloadAllData();
    if (currentTrackRef.current) {
      await recalculateQueue(currentTrackRef.current);
    }
  };

  const handleChangeTrackGenreDirect = async (newGenre: string) => {
    if (!trackToMove) return;
    const preset = GENRE_PRESETS[newGenre];
    if (!preset) return;
    await LocalStore.updateTrackFields(trackToMove.id, {
      genre: newGenre,
      energy: preset.energy,
      genreWeight: preset.genreWeight,
      tempoBpm: preset.bpm,
      groupId: preset.defaultGroupId,
    });
    setTrackToMove(null);
    await reloadAllData();
    if (currentTrackRef.current) {
      await recalculateQueue(currentTrackRef.current);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  // ============================================================================
  // PESTAÑA 1 (IZQUIERDA): BUSCADOR CON PRIORIDAD ALFABÉTICA + SIMILITUD ACÚSTICA
  // ============================================================================
  const renderSearchTab = () => {
    const searchResults = searchTracksWithAcousticFallback(
      searchQuery,
      allTracks,
      selectedMood,
      currentTrack
    );

    const exactList = searchResults.filter((r) => r.matchType === 'exact');
    const acousticList = searchResults.filter((r) => r.matchType === 'acoustic');

    return (
      <View style={styles.tabScreenContainer}>
        {/* Barra superior estilo Music */}
        <View style={styles.topSearchHeader}>
          <View style={styles.brandRow}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoCircleText}>▶</Text>
            </View>
            <Text style={styles.brandTitle}>Offline Vibe</Text>
          </View>
          <Pressable onPress={triggerAudioImport} style={styles.topImportBtn}>
            <Text style={styles.topImportBtnText}>+ Importar MP3</Text>
          </Pressable>
        </View>

        {/* Input de Búsqueda Híbrida */}
        <View style={styles.searchBoxWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar canción, artista o género..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchBtn}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Píldoras de estado de ánimo / género */}
        <View style={styles.moodScrollContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.moodScrollContent}
          >
            {MOOD_FILTERS.map((mood) => {
              const active = selectedMood === mood;
              return (
                <Pressable
                  key={mood}
                  onPress={() => setSelectedMood(mood)}
                  style={[styles.moodChip, active && styles.moodChipActive]}
                >
                  <Text
                    style={[
                      styles.moodChipText,
                      active && styles.moodChipTextActive,
                    ]}
                  >
                    {mood}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Lista combinada: Matches Exactos -> Similares Musicalmente */}
        <FlatList
          data={searchResults}
          keyExtractor={(item) => `${item.matchType}_${item.track.id}`}
          contentContainerStyle={{ paddingBottom: currentTrack ? 95 : 24 }}
          ListHeaderComponent={
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderText}>
                {searchQuery.trim().length > 0
                  ? `Coincidencias (${exactList.length})`
                  : 'Selección rápida'}
              </Text>
              {searchResults.length > 0 && (
                <Pressable
                  onPress={() => loadTrack(searchResults[0].track, true, true)}
                  style={styles.playAllPill}
                >
                  <Text style={styles.playAllText}>Reproducir todo</Text>
                </Pressable>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyLibraryCard}>
              <Text style={styles.emptyLibraryTitle}>
                Tu biblioteca local está vacía
              </Text>
              <Text style={styles.emptyLibrarySub}>
                Importa tus archivos MP3 para que el motor clasifique Rock,
                Dembow, Reggaeton, Rap y arme tus álbumes inteligentes.
              </Text>
              <Pressable
                onPress={triggerAudioImport}
                style={styles.emptyImportCta}
              >
                <Text style={styles.emptyImportCtaText}>
                  Seleccionar archivos MP3
                </Text>
              </Pressable>
            </View>
          }
          renderItem={({ item, index }) => {
            const isFirstAcoustic =
              item.matchType === 'acoustic' &&
              index === exactList.length &&
              acousticList.length > 0;
            const isCurrent = currentTrack?.id === item.track.id;

            return (
              <View>
                {isFirstAcoustic && (
                  <View style={styles.acousticDividerHeader}>
                    <Text style={styles.acousticDividerTitle}>
                      Similares musicalmente (Vector 4D)
                    </Text>
                    <Text style={styles.acousticDividerSub}>
                      Sin coincidencia alfabética, ordenadas por cercanía de
                      género, BPM y energía
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={() => loadTrack(item.track, true, true)}
                  style={[
                    styles.searchTrackRow,
                    isCurrent && styles.searchTrackRowActive,
                  ]}
                >
                  <View
                    style={[
                      styles.searchThumb,
                      isCurrent && { backgroundColor: '#7c3aed' },
                    ]}
                  >
                    <Text style={styles.searchThumbText}>
                      {isCurrent
                        ? '▶'
                        : item.track.genre.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.searchTrackInfo}>
                    <Text
                      style={[
                        styles.searchTrackTitle,
                        isCurrent && { color: '#a78bfa' },
                      ]}
                      numberOfLines={1}
                    >
                      {item.track.title}
                    </Text>
                    <Text style={styles.searchTrackSub} numberOfLines={1}>
                      {item.track.artist} • {item.track.genre} •{' '}
                      {item.track.energy.toFixed(1)}E
                    </Text>
                  </View>

                  {item.matchType === 'acoustic' && (
                    <View style={styles.acousticSimBadge}>
                      <Text style={styles.acousticSimText}>
                        {(item.affinityScore * 100).toFixed(0)}% afín
                      </Text>
                    </View>
                  )}

                  <Pressable
                    onPress={() => setTrackToMove(item.track)}
                    style={styles.moreDotsBtn}
                  >
                    <Text style={styles.moreDotsText}>⋮</Text>
                  </Pressable>
                </Pressable>
              </View>
            );
          }}
        />
      </View>
    );
  };

  // ============================================================================
  // PESTAÑA 2 (CENTRO): REPRODUCTOR PRINCIPAL COMPLETO
  // ============================================================================
  const renderPlayerTab = () => {
    return (
      <View style={styles.playerTabContainer}>
        <DynamicIslandPreview
          title={currentTrack?.title || 'Offline Vibe'}
          artist={currentTrack?.artist || 'Listo para reproducir'}
          isPlaying={isPlaying}
          energy={currentTrack?.energy ?? 8.2}
          bpm={currentTrack?.tempoBpm ?? 122}
          genre={currentTrack?.genre ?? 'Rock en Inglés'}
        />

        <View style={styles.header}>
          <Text style={styles.appTitle}>OFFLINE VIBE</Text>
          <Text style={styles.headerSubtitle}>
            {currentTrack?.album || 'Acoustic Graph Flow'}
          </Text>
        </View>

        <View style={styles.artworkContainer}>
          <Animated.View
            style={[
              styles.vinylDisc,
              isPlaying && styles.vinylPlayingBorder,
              { transform: [{ rotate: spin }] },
            ]}
          >
            <View style={styles.vinylOuterRing}>
              <View style={styles.vinylCenterGroove}>
                <View style={styles.vinylCenterLabel}>
                  <Text style={styles.vinylLabelText}>OV</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        <View style={styles.metaSection}>
          <View style={styles.titleRow}>
            <View style={styles.textContainer}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {currentTrack?.title || 'Sin pista activa'}
              </Text>
              <Pressable
                onPress={() =>
                  currentTrack
                    ? setTrackToMove(currentTrack)
                    : triggerAudioImport()
                }
              >
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {currentTrack
                    ? `${currentTrack.artist} • 🏷️ Mover / Género`
                    : 'Toca + MP3 para cargar tu música'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.actionButtonsRow}>
              <Pressable onPress={triggerAudioImport} style={styles.importButton}>
                <Text style={styles.importButtonText}>+ MP3</Text>
              </Pressable>

              <Pressable
                onPress={() => setIsQueueVisible(true)}
                style={styles.queueButton}
              >
                <Text style={styles.queueButtonText}>
                  Cola ∞ ({queue.length})
                </Text>
              </Pressable>
            </View>
          </View>

          <AcousticVectorBadge
            energy={currentTrack?.energy ?? 8.2}
            bpm={currentTrack?.tempoBpm ?? 122}
            popularity={currentTrack?.popularity ?? 0.72}
            genre={currentTrack?.genre ?? 'Rock en Inglés'}
            albumName={currentTrack?.album}
            onCycleGenre={currentTrack ? handleCycleGenre : undefined}
            onAdjustEnergy={currentTrack ? handleAdjustEnergy : undefined}
          />
        </View>

        <Pressable
          onLayout={(e: LayoutChangeEvent) =>
            setScrubberWidth(Math.max(1, e.nativeEvent.layout.width))
          }
          onPress={handleSeek}
          style={styles.scrubberSection}
        >
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, (position / duration) * 100)}%` },
              ]}
            />
          </View>
          <View style={styles.timeLabelsRow}>
            <Text style={styles.timeLabel}>{formatTime(position)}</Text>
            <Text style={styles.timeLabel}>
              -{formatTime(Math.max(0, duration - position))}
            </Text>
          </View>
        </Pressable>

        <View style={styles.controlsRow}>
          <Pressable onPress={skipPrevious} style={styles.secondaryButton}>
            <Text style={styles.secondaryIconText}>⏮</Text>
          </Pressable>

          <Pressable onPress={togglePlayPause} style={styles.mainPlayButton}>
            <Text style={styles.playIconText}>{isPlaying ? '❚❚' : '▶'}</Text>
          </Pressable>

          <Pressable onPress={skipNext} style={styles.secondaryButton}>
            <Text style={styles.secondaryIconText}>⏭</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // ============================================================================
  // PESTAÑA 3 (DERECHA): ÁLBUMES Y GRUPOS INTELIGENTES (RENOMBRAR Y MOVER PISTAS)
  // ============================================================================
  const renderGroupsTab = () => {
    const activeGroup = groups.find((g) => g.id === selectedGroupId) || null;
    const tracksInActiveGroup = activeGroup
      ? allTracks.filter((t) => t.groupId === activeGroup.id)
      : [];

    return (
      <View style={styles.tabScreenContainer}>
        <View style={styles.topSearchHeader}>
          <View>
            <Text style={styles.brandTitle}>Álbumes y Grupos</Text>
            <Text style={styles.groupsHeaderSub}>
              Agrupados por similitud acústica • Toca ✏️ para renombrar
            </Text>
          </View>
          <Pressable
            onPress={() => setIsNewGroupModalOpen(true)}
            style={styles.topImportBtn}
          >
            <Text style={styles.topImportBtnText}>+ Crear Grupo</Text>
          </Pressable>
        </View>

        {activeGroup ? (
          // Vista interna de un Álbum/Grupo abierto
          <View style={{ flex: 1 }}>
            <View style={styles.openGroupBanner}>
              <Pressable
                onPress={() => setSelectedGroupId(null)}
                style={styles.backToGroupsBtn}
              >
                <Text style={styles.backToGroupsText}>← Todos los álbumes</Text>
              </Pressable>

              <View style={styles.openGroupTitleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.openGroupTitle}>{activeGroup.name}</Text>
                  <Text style={styles.openGroupSub}>
                    {tracksInActiveGroup.length} pista(s) •{' '}
                    {activeGroup.targetEnergy.toFixed(1)}E promedio
                  </Text>
                </View>

                <Pressable
                  onPress={() => {
                    setRenamingGroup(activeGroup);
                    setRenameInputText(activeGroup.name);
                  }}
                  style={styles.renamePillBtn}
                >
                  <Text style={styles.renamePillText}>✏️ Renombrar</Text>
                </Pressable>
              </View>
            </View>

            <FlatList
              data={tracksInActiveGroup}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: currentTrack ? 95 : 24 }}
              ListEmptyComponent={
                <Text style={styles.emptyGroupText}>
                  No hay canciones en "{activeGroup.name}". Puedes mover
                  canciones aquí tocando los 3 puntos (⋮) de cualquier pista.
                </Text>
              }
              renderItem={({ item }) => {
                const isCurrent = currentTrack?.id === item.id;
                return (
                  <Pressable
                    onPress={() => loadTrack(item, true, true)}
                    style={[
                      styles.searchTrackRow,
                      isCurrent && styles.searchTrackRowActive,
                    ]}
                  >
                    <View
                      style={[
                        styles.searchThumb,
                        { backgroundColor: activeGroup.accentColor },
                      ]}
                    >
                      <Text style={styles.searchThumbText}>
                        {isCurrent ? '▶' : '♪'}
                      </Text>
                    </View>
                    <View style={styles.searchTrackInfo}>
                      <Text style={styles.searchTrackTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.searchTrackSub} numberOfLines={1}>
                        {item.artist} • {item.genre} • {item.energy.toFixed(1)}E
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setTrackToMove(item)}
                      style={styles.moveTrackBadgeBtn}
                    >
                      <Text style={styles.moveTrackBadgeText}>⇄ Mover</Text>
                    </Pressable>
                  </Pressable>
                );
              }}
            />
          </View>
        ) : (
          // Cuadrícula de Álbumes y Sencillos agrupados (Estilo Captura 3)
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.albumGridRow}
            contentContainerStyle={{ paddingBottom: currentTrack ? 95 : 24 }}
            renderItem={({ item }) => {
              const groupTracks = allTracks.filter((t) => t.groupId === item.id);
              return (
                <Pressable
                  onPress={() => setSelectedGroupId(item.id)}
                  style={styles.albumSquareCard}
                >
                  <View
                    style={[
                      styles.albumCoverBox,
                      { borderColor: item.accentColor },
                    ]}
                  >
                    <View
                      style={[
                        styles.albumAccentCircle,
                        { backgroundColor: item.accentColor },
                      ]}
                    >
                      <Text style={styles.albumCountBig}>
                        {groupTracks.length}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => {
                        setRenamingGroup(item);
                        setRenameInputText(item.name);
                      }}
                      style={styles.cardCornerEditBtn}
                    >
                      <Text style={styles.cardCornerEditText}>✏️</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.albumCardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.albumCardSub} numberOfLines={1}>
                    {groupTracks.length} pistas • {item.targetBpm} BPM
                  </Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.rootContainer,
        {
          paddingTop: insets.top > 0 ? insets.top + 4 : 24,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
      ]}
    >
      <StatusBar barStyle="light-content" backgroundColor="#050508" translucent />

      {/* CONTENIDO DE LA PESTAÑA ACTIVA */}
      <View style={styles.mainViewport}>
        {activeBottomTab === 'search' && renderSearchTab()}
        {activeBottomTab === 'player' && renderPlayerTab()}
        {activeBottomTab === 'groups' && renderGroupsTab()}
      </View>

      {/* MINI-REPRODUCTOR FLOTANTE (Aparece en Explorar y Álbumes tal como en las capturas) */}
      {activeBottomTab !== 'player' && currentTrack && (
        <Pressable
          onPress={() => setActiveBottomTab('player')}
          style={styles.floatingMiniPlayer}
        >
          <View style={styles.miniPlayerThumb}>
            <Text style={styles.miniPlayerThumbText}>OV</Text>
          </View>
          <View style={styles.miniPlayerTextCol}>
            <Text style={styles.miniPlayerTitle} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <Text style={styles.miniPlayerArtist} numberOfLines={1}>
              {currentTrack.artist} • {currentTrack.album}
            </Text>
          </View>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            style={styles.miniPlayerBtn}
          >
            <Text style={styles.miniPlayerBtnText}>
              {isPlaying ? '❚❚' : '▶'}
            </Text>
          </Pressable>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              skipNext();
            }}
            style={styles.miniPlayerBtn}
          >
            <Text style={styles.miniPlayerBtnText}>⏭</Text>
          </Pressable>
        </Pressable>
      )}

      {/* BARRA INFERIOR DE 3 ÍCONOS: IZQUIERDA (BUSCADOR), CENTRO (REPRODUCTOR), DERECHA (GRUPOS) */}
      <View style={styles.bottomTabBar}>
        <Pressable
          onPress={() => setActiveBottomTab('search')}
          style={styles.bottomTabItem}
        >
          <Text
            style={[
              styles.bottomTabIcon,
              activeBottomTab === 'search' && styles.bottomTabActive,
            ]}
          >
            🔍
          </Text>
          <Text
            style={[
              styles.bottomTabLabel,
              activeBottomTab === 'search' && styles.bottomTabActive,
            ]}
          >
            Buscador
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveBottomTab('player')}
          style={styles.bottomTabItem}
        >
          <View
            style={[
              styles.centerPlayerTabPill,
              activeBottomTab === 'player' && styles.centerPlayerTabPillActive,
            ]}
          >
            <Text style={styles.centerPlayerTabIcon}>💿</Text>
          </View>
          <Text
            style={[
              styles.bottomTabLabel,
              activeBottomTab === 'player' && styles.bottomTabActive,
            ]}
          >
            Reproductor
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveBottomTab('groups')}
          style={styles.bottomTabItem}
        >
          <Text
            style={[
              styles.bottomTabIcon,
              activeBottomTab === 'groups' && styles.bottomTabActive,
            ]}
          >
            📁
          </Text>
          <Text
            style={[
              styles.bottomTabLabel,
              activeBottomTab === 'groups' && styles.bottomTabActive,
            ]}
          >
            Álbumes
          </Text>
        </Pressable>
      </View>

      {/* MODAL DE COLA INFINITA */}
      <InfiniteQueueModal
        visible={isQueueVisible}
        onClose={() => setIsQueueVisible(false)}
        queue={queue}
        allTracks={allTracks}
        currentTrackId={currentTrack?.id}
        onSelectTrack={(track) => loadTrack(track, true, true)}
        onDeleteTrack={handleDeleteTrack}
        onImportRequest={() => {
          setIsQueueVisible(false);
          setTimeout(triggerAudioImport, 250);
        }}
      />

      {/* MODAL NATIVO MULTIPLATAFORMA PARA RENOMBRAR UN ÁLBUM / GRUPO */}
      <Modal
        visible={Boolean(renamingGroup)}
        transparent
        animationType="fade"
        onRequestClose={() => setRenamingGroup(null)}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Renombrar Álbum / Grupo</Text>
            <Text style={styles.dialogSub}>
              Define el nombre personalizado para agrupar estas pistas:
            </Text>
            <TextInput
              style={styles.dialogInput}
              value={renameInputText}
              onChangeText={setRenameInputText}
              placeholder="Ej. Rock en Inglés, Dembow Pesado..."
              placeholderTextColor="#64748b"
              autoFocus
            />
            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setRenamingGroup(null)}
                style={styles.dialogCancelBtn}
              >
                <Text style={styles.dialogCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmRenameGroup}
                style={styles.dialogConfirmBtn}
              >
                <Text style={styles.dialogConfirmText}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL PARA CREAR UN NUEVO GRUPO PERSONALIZADO */}
      <Modal
        visible={isNewGroupModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNewGroupModalOpen(false)}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Nuevo Álbum / Grupo</Text>
            <Text style={styles.dialogSub}>
              Escribe el nombre del grupo para organizar tus canciones:
            </Text>
            <TextInput
              style={styles.dialogInput}
              value={newGroupNameText}
              onChangeText={setNewGroupNameText}
              placeholder="Ej. Ruta Maracaibo, Favoritas..."
              placeholderTextColor="#64748b"
              autoFocus
            />
            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setIsNewGroupModalOpen(false)}
                style={styles.dialogCancelBtn}
              >
                <Text style={styles.dialogCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmCreateGroup}
                style={styles.dialogConfirmBtn}
              >
                <Text style={styles.dialogConfirmText}>Crear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL PARA MOVER CANCIÓN DE UN GRUPO A OTRO O ETIQUETAR SU GÉNERO */}
      <Modal
        visible={Boolean(trackToMove)}
        transparent
        animationType="slide"
        onRequestClose={() => setTrackToMove(null)}
      >
        <View style={styles.dialogOverlay}>
          <View style={[styles.dialogCard, { maxHeight: '80%' }]}>
            <Text style={styles.dialogTitle} numberOfLines={1}>
              {trackToMove?.title}
            </Text>
            <Text style={styles.dialogSub}>
              1. Mover a otro Álbum / Grupo (recalibra afinidad):
            </Text>

            <ScrollView style={{ maxHeight: 180, marginBottom: 12 }}>
              {groups.map((grp) => {
                const isCurrentGrp = trackToMove?.groupId === grp.id;
                return (
                  <Pressable
                    key={grp.id}
                    onPress={() => handleMoveTrackToGroup(grp.id)}
                    style={[
                      styles.groupOptionRow,
                      isCurrentGrp && styles.groupOptionRowActive,
                    ]}
                  >
                    <View
                      style={[
                        styles.groupDot,
                        { backgroundColor: grp.accentColor },
                      ]}
                    />
                    <Text style={styles.groupOptionText}>{grp.name}</Text>
                    {isCurrentGrp && (
                      <Text style={styles.groupCurrentTag}>Actual</Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.dialogSub}>
              2. O etiquetar directamente uno de tus 10 géneros:
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginVertical: 8 }}
            >
              {Object.keys(GENRE_PRESETS).map((gName) => {
                const isSelected = trackToMove?.genre === gName;
                return (
                  <Pressable
                    key={gName}
                    onPress={() => handleChangeTrackGenreDirect(gName)}
                    style={[
                      styles.moodChip,
                      isSelected && styles.moodChipActive,
                      { marginRight: 8 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.moodChipText,
                        isSelected && styles.moodChipTextActive,
                      ]}
                    >
                      {gName}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => setTrackToMove(null)}
              style={[
                styles.dialogCancelBtn,
                { alignSelf: 'flex-end', marginTop: 8 },
              ]}
            >
              <Text style={styles.dialogCancelText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#050508',
  },
  mainViewport: {
    flex: 1,
  },
  playerTabContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  tabScreenContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  topSearchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoCircleText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  groupsHeaderSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  topImportBtn: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  topImportBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  searchBoxWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121e',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#1e1b4b',
    marginBottom: 10,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  moodScrollContainer: {
    marginBottom: 12,
  },
  moodScrollContent: {
    gap: 8,
    paddingRight: 12,
  },
  moodChip: {
    backgroundColor: '#141422',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222238',
  },
  moodChipActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#a78bfa',
  },
  moodChipText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  moodChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHeaderText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  playAllPill: {
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  playAllText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600',
  },
  searchTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 12,
    marginBottom: 4,
  },
  searchTrackRowActive: {
    backgroundColor: 'rgba(124, 58, 237, 0.14)',
  },
  searchThumb: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#1e1b4b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  searchThumbText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  searchTrackInfo: {
    flex: 1,
    marginRight: 8,
  },
  searchTrackTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  searchTrackSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  acousticSimBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 4,
  },
  acousticSimText: {
    color: '#10b981',
    fontSize: 10,
    fontFamily: MONO_FONT,
    fontWeight: '700',
  },
  moreDotsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  moreDotsText: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '900',
  },
  acousticDividerHeader: {
    marginTop: 16,
    marginBottom: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e1b4b',
  },
  acousticDividerTitle: {
    color: '#a78bfa',
    fontSize: 15,
    fontWeight: '800',
  },
  acousticDividerSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  emptyLibraryCard: {
    backgroundColor: '#0c0c14',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#1e1b4b',
  },
  emptyLibraryTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyLibrarySub: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyImportCta: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  emptyImportCtaText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  albumGridRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  albumSquareCard: {
    width: (width - 44) / 2,
  },
  albumCoverBox: {
    width: '100%',
    height: (width - 44) / 2,
    backgroundColor: '#0f0f1a',
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  albumAccentCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  albumCountBig: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  cardCornerEditBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  cardCornerEditText: {
    fontSize: 12,
  },
  albumCardTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  albumCardSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  openGroupBanner: {
    backgroundColor: '#10101c',
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e1b4b',
  },
  backToGroupsBtn: {
    marginBottom: 8,
  },
  backToGroupsText: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '700',
  },
  openGroupTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  openGroupTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  openGroupSub: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  renamePillBtn: {
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  renamePillText: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyGroupText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 36,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  moveTrackBadgeBtn: {
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  moveTrackBadgeText: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
  },
  appTitle: {
    color: '#8b5cf6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  headerSubtitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  artworkContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  vinylDisc: {
    width: width * 0.54,
    height: width * 0.54,
    borderRadius: (width * 0.54) / 2,
    backgroundColor: '#0b0b12',
    borderWidth: 2,
    borderColor: '#1e1b4b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vinylPlayingBorder: {
    borderColor: '#7c3aed',
  },
  vinylOuterRing: {
    width: width * 0.4,
    height: width * 0.4,
    borderRadius: (width * 0.4) / 2,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vinylCenterGroove: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#050508',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#312e81',
  },
  vinylCenterLabel: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vinylLabelText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  metaSection: {
    marginVertical: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  textContainer: {
    flex: 1,
    marginRight: 10,
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  trackArtist: {
    color: '#a78bfa',
    fontSize: 12,
    marginTop: 2,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  importButton: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
  },
  importButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  queueButton: {
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4338ca',
  },
  queueButtonText: {
    color: '#c7d2fe',
    fontSize: 11,
    fontWeight: '700',
  },
  scrubberSection: {
    marginVertical: 4,
    paddingVertical: 4,
  },
  progressBarBackground: {
    height: 5,
    backgroundColor: '#1e293b',
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 2.5,
  },
  timeLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeLabel: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: MONO_FONT,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 36,
    marginBottom: 4,
  },
  secondaryButton: {
    padding: 10,
  },
  secondaryIconText: {
    color: '#e2e8f0',
    fontSize: 22,
  },
  mainPlayButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIconText: {
    color: '#000000',
    fontSize: 22,
    fontWeight: '900',
  },
  floatingMiniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141424',
    marginHorizontal: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2e1065',
  },
  miniPlayerThumb: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  miniPlayerThumbText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  miniPlayerTextCol: {
    flex: 1,
    marginRight: 8,
  },
  miniPlayerTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  miniPlayerArtist: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 1,
  },
  miniPlayerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  miniPlayerBtnText: {
    color: '#ffffff',
    fontSize: 17,
  },
  bottomTabBar: {
    flexDirection: 'row',
    height: 62,
    backgroundColor: '#090910',
    borderTopWidth: 1,
    borderTopColor: '#161626',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  bottomTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabIcon: {
    fontSize: 19,
    color: '#64748b',
  },
  bottomTabLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 3,
  },
  bottomTabActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  centerPlayerTabPill: {
    width: 38,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#161626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerPlayerTabPillActive: {
    backgroundColor: '#7c3aed',
  },
  centerPlayerTabIcon: {
    fontSize: 15,
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    backgroundColor: '#0f0f1a',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#312e81',
  },
  dialogTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  dialogSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 10,
  },
  dialogInput: {
    backgroundColor: '#181828',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#4338ca',
    marginBottom: 16,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  dialogCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1e293b',
  },
  dialogCancelText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  dialogConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#7c3aed',
  },
  dialogConfirmText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  groupOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: '#161626',
  },
  groupOptionRowActive: {
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  groupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  groupOptionText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  groupCurrentTag: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '700',
  },
});