import { Model, Relation } from '@nozbe/watermelondb';
import { text, field, relation } from '@nozbe/watermelondb/decorators';
import type Track from './Track';

export default class PlayHistory extends Model {
  static table = 'play_history';

  static associations = {
    tracks: { type: 'belongs_to' as const, key: 'track_id' },
  };

  @text('track_id') trackId!: string;
  @text('artist_id') artistId!: string;
  @field('played_at') playedAt!: number;

  @relation('tracks', 'track_id') track!: Relation<Track>;
}