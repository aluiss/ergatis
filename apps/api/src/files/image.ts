import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

const AVATAR_SIZE = 512;
const PORTFOLIO_MAX = 1600;
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Recodifica imagens públicas. O sharp descarta os metadados por padrão, o que
 * remove GPS e dados do aparelho, e a recodificação elimina conteúdo embutido.
 */
export async function processPublicImage(input: Buffer, kind: 'avatar' | 'portfolio'): Promise<Buffer> {
  const image = sharp(input, { autoOrient: true, limitInputPixels: MAX_INPUT_PIXELS });
  const resized = kind === 'avatar'
    ? image.resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    : image.resize(PORTFOLIO_MAX, PORTFOLIO_MAX, { fit: 'inside', withoutEnlargement: true });
  try {
    return await resized.webp({ quality: 82 }).toBuffer();
  } catch {
    throw new BadRequestException('A imagem está corrompida ou é grande demais');
  }
}
