import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { env } from './config/env';

export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  app.use(helmet());
  // Sem isto, todo usuário apareceria com o IP do Next e dividiria o mesmo rate limit.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.enableShutdownHooks();
}
