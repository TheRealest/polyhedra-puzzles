import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Coral Reef Puzzle',
  description: 'A 3D puzzle game on a dodecahedron surface',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
