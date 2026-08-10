import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

// Bloquer la résolution sur le dossier frontend (évite C:\Users\User à cause du lockfile parent)
const getRoot = () => {
  const cwd = process.cwd();
  if (cwd.includes("shekinah-schoolmatrix-frontend")) return path.resolve(cwd);
  try {
    if (typeof __dirname !== "undefined") return path.resolve(__dirname);
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  } catch {
    return path.resolve(cwd);
  }
};
const projectRoot = getRoot();

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const apiBase = process.env.API_INTERNAL_URL || "http://localhost:3000";
    const base = apiBase.replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${base}/:path*` }];
  },
  turbopack: {
    root: projectRoot,
  },
  webpack: (config) => {
    config.context = projectRoot;
    config.resolve = config.resolve ?? {};
    config.resolve.modules = [
      path.join(projectRoot, "node_modules"),
      ...(config.resolve.modules ?? []),
    ];
    return config;
  },
};

export default nextConfig;
