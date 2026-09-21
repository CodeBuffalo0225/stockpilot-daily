import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The Remotion compositions are ESM-heavy and ship untranspiled helpers.
  transpilePackages: ['remotion', '@remotion/player', '@remotion/google-fonts'],
  outputFileTracingIncludes: {
    // The local-file fallback reads these at request time on the server. Both the
    // board and the ask endpoint resolve a deck, so both need the files traced in.
    '/': ['./data/decks/**'],
    '/api/ask': ['./data/decks/**'],
  },
};

export default nextConfig;
