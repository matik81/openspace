import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenSpace',
  description: 'OpenSpace workspace and booking platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

