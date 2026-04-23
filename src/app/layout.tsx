import type { Metadata } from 'next';
import ReactDOM from 'react-dom';
import './globals.css';

export const metadata: Metadata = {
  title: '回响',
  description: '发一首歌的链接，有人陪你听。',
  keywords: ['回响', '音乐共鸣', '深夜听歌'],
  authors: [{ name: '回响' }],
  openGraph: {
    title: '回响',
    description: '发一首歌的链接，有人陪你听。',
    type: 'website',
    locale: 'zh_CN',
  },
};

function FontPreload() {
  ReactDOM.preconnect('https://fonts.googleapis.com');
  ReactDOM.preconnect('https://fonts.gstatic.com');
  return null;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <FontPreload />
      <body className={`antialiased`}>
        <div className="grain-overlay" />
        {children}
      </body>
    </html>
  );
}
