import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

interface Bucket {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

const MINUTE = 60_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Limitation des tentatives de connexion, en mémoire du processus.
 *
 * Volontairement indexée sur l'IDENTIFIANT saisi, pas sur l'IP : le front
 * WordPress appelle l'API depuis une seule IP serveur, une limite par IP
 * stricte bloquerait toute l'école dès qu'un parent se trompe.
 *
 * Un second compteur par IP existe, beaucoup plus large et désactivable
 * (LOGIN_MAX_FAILURES_PER_IP=0), pour freiner le balayage multi-comptes.
 *
 * Réglages (env) :
 *   LOGIN_MAX_FAILURES         défaut 5    échecs par identifiant
 *   LOGIN_WINDOW_MINUTES       défaut 15   fenêtre glissante
 *   LOGIN_LOCK_MINUTES         défaut 15   durée du blocage
 *   LOGIN_MAX_FAILURES_PER_IP  défaut 60   0 = désactivé
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  private readonly byLogin = new Map<string, Bucket>();
  private readonly byIp = new Map<string, Bucket>();

  private readonly maxFailures = envInt('LOGIN_MAX_FAILURES', 5);
  private readonly windowMs = envInt('LOGIN_WINDOW_MINUTES', 15) * MINUTE;
  private readonly lockMs = envInt('LOGIN_LOCK_MINUTES', 15) * MINUTE;
  private readonly maxFailuresPerIp = envInt('LOGIN_MAX_FAILURES_PER_IP', 60);

  /** À appeler AVANT de vérifier le mot de passe. Lève 429 si bloqué. */
  assertAllowed(login: string, ip?: string): void {
    this.assertBucket(this.byLogin, this.key(login), this.maxFailures);
    if (ip && this.maxFailuresPerIp > 0) {
      this.assertBucket(this.byIp, ip, this.maxFailuresPerIp);
    }
  }

  /** Identifiants refusés. */
  recordFailure(login: string, ip?: string): void {
    this.bump(this.byLogin, this.key(login), this.maxFailures);
    if (ip && this.maxFailuresPerIp > 0) {
      this.bump(this.byIp, ip, this.maxFailuresPerIp);
    }
  }

  /** Mot de passe correct : on repart de zéro. */
  recordSuccess(login: string, ip?: string): void {
    this.byLogin.delete(this.key(login));
    if (ip) this.byIp.delete(ip);
  }

  private key(login: string): string {
    return login.trim().toLowerCase();
  }

  private assertBucket(
    store: Map<string, Bucket>,
    key: string,
    max: number,
  ): void {
    const now = Date.now();
    const bucket = store.get(key);
    if (!bucket) return;
    if (bucket.lockedUntil > now) {
      const retryAfter = Math.ceil((bucket.lockedUntil - now) / 1000);
      throw new HttpException(
        {
          message:
            'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
          error: 'Too Many Requests',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          retry_after_seconds: retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (now - bucket.windowStartedAt > this.windowMs) {
      store.delete(key);
      return;
    }
    if (bucket.failures >= max) {
      bucket.lockedUntil = now + this.lockMs;
      throw new HttpException(
        {
          message:
            'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
          error: 'Too Many Requests',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          retry_after_seconds: Math.ceil(this.lockMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private bump(store: Map<string, Bucket>, key: string, max: number): void {
    const now = Date.now();
    this.prune(store, now);
    const bucket = store.get(key);
    if (!bucket || now - bucket.windowStartedAt > this.windowMs) {
      store.set(key, { failures: 1, windowStartedAt: now, lockedUntil: 0 });
      return;
    }
    bucket.failures += 1;
    if (bucket.failures >= max) {
      bucket.lockedUntil = now + this.lockMs;
      this.logger.warn(`Connexions bloquées ${this.lockMs / MINUTE} min pour « ${key} ».`);
    }
  }

  /** Empêche la map de grossir indéfiniment sur une longue exécution. */
  private prune(store: Map<string, Bucket>, now: number): void {
    if (store.size < 5000) return;
    for (const [k, b] of store) {
      if (b.lockedUntil <= now && now - b.windowStartedAt > this.windowMs) {
        store.delete(k);
      }
    }
  }
}
