import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';

const MONO_FONT = Platform.select({ ios: 'Courier', android: 'monospace' });

interface DynamicIslandProps {
  title: string;
  artist: string;
  isPlaying: boolean;
  energy: number;
  bpm: number;
  genre: string;
}

export const DynamicIslandPreview: React.FC<DynamicIslandProps> = ({
  title,
  artist,
  isPlaying,
  energy,
  bpm,
  genre,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={styles.islandContainer}>
      <Pressable
        onPress={() => setIsExpanded(!isExpanded)}
        style={[
          styles.pillBase,
          isExpanded ? styles.pillExpanded : styles.pillCompact,
        ]}
      >
        {!isExpanded ? (
          <View style={styles.compactRow}>
            <View style={styles.leadingContainer}>
              <View style={styles.miniIconBadge}>
                <Text style={styles.miniIconText}>OV</Text>
              </View>
              <Text style={styles.compactEnergyBadge}>{energy.toFixed(1)}E</Text>
            </View>
            <View style={styles.trailingWave}>
              <View style={[styles.waveBar, isPlaying && styles.waveBarAnim1]} />
              <View style={[styles.waveBar, isPlaying && styles.waveBarAnim2]} />
              <View style={[styles.waveBar, isPlaying && styles.waveBarAnim3]} />
            </View>
          </View>
        ) : (
          <View style={styles.expandedContent}>
            <View style={styles.expandedHeader}>
              <View style={styles.expandedArtwork}>
                <Text style={styles.expandedArtworkText}>OV</Text>
              </View>
              <View style={styles.expandedInfo}>
                <Text style={styles.expandedTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.expandedArtist} numberOfLines={1}>
                  {artist}
                </Text>
                <Text style={styles.expandedVectorMetric}>
                  {genre} • Energy: {energy.toFixed(1)} • {bpm} BPM
                </Text>
              </View>
            </View>
          </View>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  islandContainer: {
    alignItems: 'center',
    marginBottom: 4,
  },
  pillBase: {
    backgroundColor: '#000000',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.28)',
    justifyContent: 'center',
  },
  pillCompact: {
    width: 136,
    height: 34,
    paddingHorizontal: 12,
  },
  pillExpanded: {
    width: '100%',
    maxWidth: 330,
    height: 80,
    padding: 14,
    borderRadius: 26,
  },
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniIconBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniIconText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
  },
  compactEnergyBadge: {
    color: '#c4b5fd',
    fontSize: 11,
    fontFamily: MONO_FONT,
    fontWeight: '700',
  },
  trailingWave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveBar: {
    width: 2.5,
    height: 8,
    backgroundColor: '#6d28d9',
    borderRadius: 1.5,
  },
  waveBarAnim1: { height: 15, backgroundColor: '#a78bfa' },
  waveBarAnim2: { height: 9, backgroundColor: '#8b5cf6' },
  waveBarAnim3: { height: 17, backgroundColor: '#c4b5fd' },
  expandedContent: {
    flex: 1,
    justifyContent: 'center',
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expandedArtwork: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedArtworkText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 14,
  },
  expandedInfo: {
    flex: 1,
  },
  expandedTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  expandedArtist: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 1,
  },
  expandedVectorMetric: {
    color: '#a78bfa',
    fontSize: 10,
    fontFamily: MONO_FONT,
    marginTop: 4,
  },
});