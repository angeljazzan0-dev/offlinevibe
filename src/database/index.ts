import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import Track from './models/Track';
import PlayHistory from './models/PlayHistory';

const adapter = new SQLiteAdapter({
  schema,
  jsi: true,
  onSetUpError: (error) => {
    console.error('[WatermelonDB] Setup failed:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Track, PlayHistory],
});