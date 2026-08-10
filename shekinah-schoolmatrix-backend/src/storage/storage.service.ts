/**
 * Service de stockage local des fichiers.
 * Utilise STORAGE_ROOT (ou process.cwd()/storage par défaut).
 * Sous-dossiers: profiles/, uploads/, backups/
 * Création automatique des dossiers, compatible Windows et Linux (Docker).
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export type StorageFolder = 'profiles' | 'uploads' | 'backups';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private root: string = '';
  private folders: Record<StorageFolder, string> = {
    profiles: '',
    uploads: '',
    backups: '',
  };

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const root =
      this.configService.get<string>('STORAGE_ROOT') ??
      path.join(process.cwd(), 'storage');
    this.root = path.resolve(root);
    for (const folder of ['profiles', 'uploads', 'backups'] as StorageFolder[]) {
      const dir = path.join(this.root, folder);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.logger.log(`Dossier créé: ${dir}`);
      }
      this.folders[folder] = dir;
    }
  }

  getRoot(): string {
    return this.root;
  }

  getPath(folder: StorageFolder, filename: string): string {
    return path.join(this.folders[folder], filename);
  }

  /**
   * Chemin local complet pour un fichier.
   */
  resolveLocalPath(folder: StorageFolder, filename: string): string {
    return this.getPath(folder, filename);
  }

  /**
   * Chemin relatif (pour stockage en base) : profiles/xxx, uploads/xxx, backups/xxx
   */
  getRelativePath(folder: StorageFolder, filename: string): string {
    return path.join(folder, filename).replace(/\\/g, '/');
  }

  ensureDir(folder: StorageFolder): void {
    if (!fs.existsSync(this.folders[folder])) {
      fs.mkdirSync(this.folders[folder], { recursive: true });
    }
  }
}
