import { IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export class ImportCloudMediaDto {
  @IsIn(['google-drive', 'dropbox', 'canva', 'media-bank'])
  source: 'google-drive' | 'dropbox' | 'canva' | 'media-bank';

  @IsUrl({ protocols: ['https'], require_protocol: true })
  url: string;

  @IsOptional()
  @IsString()
  name?: string;
}
