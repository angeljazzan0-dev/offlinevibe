import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';

const MONO_FONT = Platform.select({ ios: 'Courier', android: 'monospace' });

interface VectorBadgeProps {
  energy: number;
  bpm: number;
  popularity: number;
  genre: string;
  albumName?: string;
  onCycleGenre?: () => void;
  onAdjustEnergy?: (delta: number) => void;
}

export const AcousticVectorBadge: React.FC<VectorBadgeProps> = ({
  energy,
  bpm,
  popularity,
  genre,
  albumName,
  onCycleGenre,
  onAdjustEnergy,
}) => {
  return (
    <View style={styles.badgeContainer}>
      <View style={styles.topRow}>
        <Pressable
          onPress={onCycleGenre}
          style={styles.genrePill}
          disabled={!onCycleGenre}
        >
          <Text style={styles.genreText}>
            {genre.toUpperCase()} {onCycleGenre ? '↻' : ''}
          </Text>
        </Pressable>

        <View style={styles.energyControls}>
          {onAdjustEnergy && (
            <Pressable
              onPress={() => onAdjustEnergy(-0.5)}
              style={styles.stepButton}
            >
              <Text style={styles.stepButtonText}>−</Text>
            </Pressable>
          )}
          <Text style={styles.energyValue}>
            Energía: {energy.toFixed(1)} / 10
          </Text>
          {onAdjustEnergy && (
            <Pressable
              onPress={() => onAdjustEnergy(0.5)}
              style={styles.stepButton}
            >
              <Text style={styles.stepButtonText}>+</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.energyMeterBackground}>
        <View
          style={[
            styles.energyMeterFill,
            { width: `${Math.min(100, Math.max(0, (energy / 10) * 100))}%` },
          ]}
        />
      </View>

      <View style={styles.metricsFooter}>
        <Text style={styles.metricItem}>Tempo: {bpm} BPM</Text>
        <Text style={styles.metricItem}>
          Afinidad: {(popularity * 100).toFixed(0)}%
        </Text>
        <Text style={styles.heuristicItem} numberOfLines={1}>
          {albumName ? `📁 ${albumName}` : 'Filtro: Δ ≤ 2.0 ✓'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    backgroundColor: '#0c0c14',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e1b4b',
    padding: 12,
    marginTop: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  genrePill: {
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  genreText: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  energyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1e1b4b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepButtonText: {
    color: '#c4b5fd',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 15,
  },
  energyValue: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  energyMeterBackground: {
    height: 5,
    backgroundColor: '#181826',
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  energyMeterFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 2.5,
  },
  metricsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metricItem: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: MONO_FONT,
  },
  heuristicItem: {
    color: '#10b981',
    fontSize: 10,
    fontFamily: MONO_FONT,
    fontWeight: '700',
    maxWidth: 130,
  },
});