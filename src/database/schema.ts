import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const SCHEMA_VERSION = 1;

export const schema = appSchema({
  version: SCHEMA_VERSION,
  tables: [
    tableSchema({
      name: 'tracks',
      columns: [
        { name: 'filename', type: 'string', isIndexed: true },
        { name: 'file_path', type: 'string' },
        { name: 'file_size', type: 'number' },
        { name: 'duration', type: 'number' },
        { name: 'bitrate', type: 'number', isOptional: true },

        { name: 'title', type: 'string', isIndexed: true },
        { name: 'artist', type: 'string', isIndexed: true },
        { name: 'artist_id', type: 'string', isIndexed: true },
        { name: 'album', type: 'string', isOptional: true },
        { name: 'genre', type: 'string', isIndexed: true },
        { name: 'sub_genre', type: 'string', isOptional: true },

        { name: 'energy', type: 'number', isIndexed: true },
        { name: 'genre_weight', type: 'number', isIndexed: true },
        { name: 'tempo_bpm', type: 'number', isIndexed: true },
        { name: 'popularity', type: 'number', isIndexed: true },

        { name: 'mood_tags', type: 'string' },
        { name: 'needs_enrichment', type: 'boolean', isIndexed: true },

        { name: 'play_count', type: 'number', isIndexed: true },
        { name: 'last_played_at', type: 'number', isOptional: true, isIndexed: true },

        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'play_history',
      columns: [
        { name: 'track_id', type: 'string', isIndexed: true },
        { name: 'artist_id', type: 'string', isIndexed: true },
        { name: 'played_at', type: 'number', isIndexed: true },
      ],
    }),
  ],
});