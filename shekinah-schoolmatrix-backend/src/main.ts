import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { resolveMediaUrl } from './uploads/media-url';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });
  const storageRoot = process.env.STORAGE_ROOT || join(process.cwd(), 'storage');
  const uploadsDir = join(storageRoot, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  // Fichier absent en local (nœud miroir) → proxy GCS (évite CORS redirect pour PDF/canvas).
  app.use('/uploads', async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const name = (req.path || '').replace(/^\/+/, '').split('/')[0];
    if (!name || name.includes('..')) return next();
    const localFile = join(uploadsDir, name);
    if (fs.existsSync(localFile)) return next();
    const publicUrl = resolveMediaUrl(`uploads/${name}`);
    if (!publicUrl || !/^https?:\/\//i.test(publicUrl)) return next();
    try {
      const upstream = await fetch(publicUrl);
      if (!upstream.ok) return next();
      const buf = Buffer.from(await upstream.arrayBuffer());
      const ct =
        upstream.headers.get('content-type') ||
        (name.toLowerCase().endsWith('.png')
          ? 'image/png'
          : name.toLowerCase().endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg');
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(buf);
    } catch {
      return next();
    }
  });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Sync-Key'],
  });
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
