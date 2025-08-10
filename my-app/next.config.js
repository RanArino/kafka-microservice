/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    // Only run ESLint on these directories during production builds
    dirs: ['src'],
  },
  typescript: {
    // Only run TypeScript checking on production builds
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig
