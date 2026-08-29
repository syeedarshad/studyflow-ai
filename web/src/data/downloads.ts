const env = import.meta.env;

export const GITHUB_URL: string =
  (env.VITE_GITHUB_URL as string) ?? "https://github.com/syeedarshad/studyflow-ai";

export const RELEASE_NOTES_URL: string =
  (env.VITE_RELEASE_NOTES_URL as string) ?? `${GITHUB_URL}/releases`;

export const APP_VERSION: string = (env.VITE_APP_VERSION as string) ?? "1.0.1";

export interface DownloadOption {
  id: string;
  platform: "windows" | "linux";
  title: string;
  description: string;
  meta: string;
  badge?: string;
  badgeType?: "accent" | "muted";
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
    description: "Recommended for most users. Full desktop setup with automatic shortcuts.",
    meta: `v${APP_VERSION} · 64-bit · .exe · ~95 MB`,
    badge: "AVAILABLE NOW",
    badgeType: "accent",
    fileType: ".exe",
    architecture: "64-bit",
    recommended: true,
    available: true,
    buttonLabel: "Download for Windows",
    url:
      (env.VITE_DOWNLOAD_WIN_INSTALLER as string) ||
      `${GITHUB_URL}/releases/latest/download/StudyFlow.AI.Setup.${APP_VERSION}.exe`,
  },
  {
    id: "win-portable",
    platform: "windows",
    title: "Windows Portable",
    description: "Standalone portable package without installation.",
    meta: "Coming soon for v1.0.1",
    badge: "COMING SOON",
    badgeType: "muted",
    fileType: ".exe",
    architecture: "64-bit",
    recommended: false,
    available: false,
    buttonLabel: "Coming Soon",
  },
  {
    id: "linux",
    platform: "linux",
    title: "Linux",
    description: "AppImage and deb packages currently in development.",
    meta: "Coming soon",
    badge: "COMING SOON",
    badgeType: "muted",
    recommended: false,
    available: false,
    buttonLabel: "Coming Soon",
  },
];
