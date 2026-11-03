/**
 * YouTube's embedded player, loaded once for the page: the smoking room's
 * jukebox and the conference hall's big screen both play through it.
 */

export type YTPlayer = {
  loadVideoById: (options: { videoId: string; startSeconds: number }) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      host?: string;
      width: number;
      height: number;
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { data: number; target: YTPlayer }) => void;
      };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<YTNamespace> | null = null;

/** Loads YouTube's player script once. */
export function loadYouTube(): Promise<YTNamespace> {
  api ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => (window.YT ? resolve(window.YT) : reject());
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      api = null;
      reject(new Error('YouTube could not be reached'));
    };
    document.head.append(script);
  });
  return api;
}
