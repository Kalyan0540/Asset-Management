export const imageSearchProviders = {
  google: { name: 'Google Lens', url: 'https://www.google.com/' },
  tineye: { name: 'TinEye', url: 'https://tineye.com/' },
} as const;

export type ImageSearchProvider = keyof typeof imageSearchProviders;

export function imageSearchExtension(mime: string) {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
    case 'image/avif':
      return '.png';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
  }
}
