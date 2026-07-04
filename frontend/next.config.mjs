/** @type {import('next').NextConfig} */
const nextConfig = {
    // Self-contained server bundle — required by the Docker runner stage.
    output: 'standalone',
};

export default nextConfig;
