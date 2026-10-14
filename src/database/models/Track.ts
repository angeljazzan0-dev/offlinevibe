import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, json } from '@nozbe/watermelondb/decorators';

export type AcousticVector = [number, number, number, number];

const sanitizeMoodTags = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  return [];
};

export default class Track extends Model {
  static table = 'tracks';

  @text('filename') filename!: string;
  @text('file_path') filePath!: string;
  @field('file_size') fileSize!: number;
  @field('duration') duration!: number;
  @field('bitrate') bitrate?: number;

  @text('title') title!: string;
  @text('artist') artist!: string;
  @text('artist_id') artistId!: string;
  @text('album') album?: string;
  @text('genre') genre!: string;
  @text('sub_genre') subGenre?: string;

  @field('energy') energy!: number;
  @field('genre_weight') genreWeight!: number;
  @field('tempo_bpm') tempoBpm!: number;
  @field('popularity') popularity!: number;

  @json('mood_tags', sanitizeMoodTags) moodTags!: string[];
  @field('needs_enrichment') needsEnrichment!: boolean;

  @field('play_count') playCount!: number;
  @field('last_played_at') lastPlayedAt?: number;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  get vector(): AcousticVector {
    return [
      this.energy,
      this.genreWeight,
      this.tempoBpm,
      this.popularity,
    ];
  }

  get normalizedVector(): [number, number, number, number] {
    return [
      Math.min(Math.max((this.energy - 1) / 9, 0), 1),
      Math.min(Math.max(this.genreWeight, 0), 1),
      Math.min(Math.max((this.tempoBpm - 60) / 140, 0), 1),
      Math.min(Math.max(this.popularity, 0), 1),
    ];
  }
}