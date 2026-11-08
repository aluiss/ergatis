import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/**
 * Torna o Ergatis instalável no celular (Android e Chrome pedem este arquivo; o
 * iPhone usa o "Adicionar à Tela de Início"). `fullscreen` (decisão de produto) ocupa
 * a tela toda, sem barra do navegador nem do sistema. Onde o aparelho não suporta
 * (iPhone, alguns navegadores), cai para `standalone`: sem barra do navegador.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: BRAND,
    short_name: BRAND,
    description: 'Encontre quem resolve: pedidos, propostas e contratações de serviços perto de você.',
    lang: 'pt-BR',
    start_url: '/painel?origem=app',
    scope: '/',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#155dfc',
    categories: ['business', 'productivity', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Atalhos ao segurar o ícone do app.
    shortcuts: [
      { name: 'Novo pedido', url: '/pedidos/novo', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Mensagens', url: '/mensagens', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Oportunidades', url: '/oportunidades', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
