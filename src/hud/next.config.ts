import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['node-pty'],
  async rewrites() {
    return [
      {
        source: '/api/proxy/:path*',
        destination: '/api/proxy/:path*'
      }
    ]
  }
}

export default nextConfig