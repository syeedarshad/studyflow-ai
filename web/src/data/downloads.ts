const env = import.meta.env;

export const GITHUB_URL: string =
  (env.VITE_GITHUB_URL as string) ?? "https://github.com/syeedarshad/studyflow-ai";

export const RELEASE_NOTES_URL: string =
  (env.VITE_RELEASE_NOTES_URL as string) ?? `${GITHUB_URL}/releases`;

export const APP_VERSION: string = (env.VITE_APP_VERSION as string) ?? "1.0.0";

export interface DownloadOption {
  id: string;
  platform: "windows" | "linux";
  title: string;
  description: string;
  meta: string;
  fileType?: string;
  architecture?: string;
  recommended?: boolean;
  available: boolean;
  buttonLabel: string;
  url?: string;
}

export const downloads: DownloadOption[] = [
  {
    id: "win-installer",
    platform: "windows",
    title: "Windows Installer",
    description: "Recommended for most users",
    meta: `v${APP_VERSION} · 64-bit · .exe`,
    fileType: ".exe",
    architecture: "64-bit",
    recommended: true,
    available: true,
    buttonLabel: "Download",
    url: (env.VITE_DOWNLOAD_WIN_INSTALLER as string) ?? `${GITHUB_URL}/releases/latest`,
  },
  {
    id: "win-portable",
    platform: "windows",
    title: "Windows Portable",
    description: "Run without installation",
    meta: `v${APP_VERSION} · 64-bit · .exe`,
    fileType: ".exe",
    architecture: "64-bit",
    recommended: false,
    available: true,
    buttonLabel: "Download",
    url: (env.VITE_DOWNLOAD_WIN_PORTABLE as string) ?? `${GITHUB_URL}/releases/latest`,
  },
  {
    id: "linux",
    platform: "linux",
    title: "Linux",
    description: "Not available yet",
    meta: "Coming soon",
    recommended: false,
    available: false,
    buttonLabel: "Coming Soon",
  },
];
