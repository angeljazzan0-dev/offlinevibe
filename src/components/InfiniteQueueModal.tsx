import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  Platform,
} from 'react-native';
import { TrackItem } from '../services/localStore';
import { RecommendedTrackResult } from '../services/recommendation';

const MONO_FONT = Platform.select({ ios: 'Courier', android: 'monospace' });

interface QueueModalProps {
  visible: boolean;
  onClose: () => void;
  queue: RecommendedTrackResult[];
  allTracks: TrackItem[];
  currentTrackId?: string;
  onSelectTrack: (track: TrackItem) => void;
  onDeleteTrack: (trackId: string) => void;
  onImportRequest: () => void;
}

export const InfiniteQueueModal: React.FC<QueueModalProps> = ({
  visible,
  onClose,
  queue,
  allTracks,
  currentTrackId,
  onSelectTrack,
  onDeleteTrack,
  onImportRequest,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'library'>('queue');

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.tabsContainer}>
              <Pressable
                onPress={() => setActiveTab('queue')}
                style={[
                  styles.tabButton,
                  activeTab === 'queue' && styles.tabButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'queue' && styles.tabTextActive,
                  ]}
                >
                  Cola ∞ ({queue.length})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('library')}
                style={[
                  styles.tabButton,
                  activeTab === 'library' && styles.tabButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'library' && styles.tabTextActive,
                  ]}
                >
                  Biblioteca ({allTracks.length})
                </Text>
              </Pressable>
            </View>

            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.subHeaderRow}>
            <Text style={styles.bodyText}>
              {activeTab === 'queue'
                ? 'Próximas pistas auto-generadas por afinidad vectorial 4D.'
                : 'Archivos MP3 almacenados en la memoria local.'}
            </Text>
            <Pressable onPress={onImportRequest} style={styles.miniAddBtn}>
              <Text style={styles.miniAddText}>+ Añadir MP3</Text>
            </Pressable>
          </View>

          {activeTab === 'queue' ? (
            <FlatList
              data={queue}
              keyExtractor={(item) => item.track.id}
              style={styles.list}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    Se requieren al menos 2 pistas en tu biblioteca para calcular
                    el flujo acústico.
                  </Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => {
                    onSelectTrack(item.track);
                    onClose();
                  }}
                  style={styles.row}
                >
                  <Text style={styles.indexCol}>{index + 1}</Text>
                  <View style={styles.infoCol}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {item.track.title}
                    </Text>
                    <Text style={styles.trackSub} numberOfLines={1}>
                      {item.track.artist} • {item.track.genre} • ΔE{' '}
                      {item.energyDelta}
                      {item.isPenalized ? ' (Rotación)' : ''}
                    </Text>
                  </View>
                  <View style={styles.badgeCol}>
                    <Text style={styles.affinityText}>
                      {(item.affinityScore * 100).toFixed(0)}%
                    </Text>
                    <Text style={styles.vectorMiniText}>
                      {item.track.energy.toFixed(1)}E
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          ) : (
            <FlatList
              data={allTracks}
              keyExtractor={(item) => item.id}
              style={styles.list}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    Tu biblioteca está vacía. Toca "+ Añadir MP3" para importar.
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isCurrent = item.id === currentTrackId;
                return (
                  <View style={[styles.row, isCurrent && styles.activeRow]}>
                    <Pressable
                      onPress={() => {
                        onSelectTrack(item);
                        onClose();
                      }}
                      style={styles.librarySelectable}
                    >
                      <View style={styles.infoCol}>
                        <Text
                          style={[
                            styles.trackTitle,
                            isCurrent && styles.activeTitle,
                          ]}
                          numberOfLines={1}
                        >
                          {isCurrent ? '▶ ' : ''}
                          {item.title}
                        </Text>
                        <Text style={styles.trackSub} numberOfLines={1}>
                          {item.artist} • {item.genre} • {item.energy.toFixed(1)}E •{' '}
                          {formatDuration(item.duration)}
                        </Text>
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => onDeleteTrack(item.id)}
                      style={styles.deleteBtn}
                    >
                      <Text style={styles.deleteText}>✕</Text>
                    </Pressable>
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#090910',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    maxHeight: '78%',
    minHeight: 360,
    borderWidth: 1,
    borderColor: '#1e1b4b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#121222',
    borderWidth: 1,
    borderColor: '#1e1b4b',
  },
  tabButtonActive: {
    backgroundColor: '#5b21b6',
    borderColor: '#7c3aed',
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  closeBtn: {
    padding: 6,
  },
  closeText: {
    color: '#94a3b8',
    fontSize: 18,
  },
  subHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  bodyText: {
    flex: 1,
    color: '#64748b',
    fontSize: 12,
  },
  miniAddBtn: {
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4338ca',
  },
  miniAddText: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '700',
  },
  list: {
    marginTop: 4,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#141424',
  },
  activeRow: {
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    borderRadius: 12,
  },
  librarySelectable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  indexCol: {
    width: 24,
    color: '#64748b',
    fontSize: 12,
    fontFamily: MONO_FONT,
  },
  infoCol: {
    flex: 1,
    marginRight: 10,
  },
  trackTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTitle: {
    color: '#a78bfa',
    fontWeight: '700',
  },
  trackSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  badgeCol: {
    alignItems: 'flex-end',
  },
  affinityText: {
    color: '#10b981',
    fontSize: 12,
    fontFamily: MONO_FONT,
    fontWeight: '700',
  },
  vectorMiniText: {
    color: '#a78bfa',
    fontSize: 10,
    fontFamily: MONO_FONT,
    marginTop: 2,
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteText: {
    color: '#64748b',
    fontSize: 14,
  },
});