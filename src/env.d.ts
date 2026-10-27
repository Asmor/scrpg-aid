/** Build-time settings (Vite reads them from the environment or a gitignored .env.local). */
interface ImportMetaEnv {
  /**
   * Where to fetch TURN relay credentials for game sessions (Phase 4): a URL that returns a
   * JSON list of ICE servers, such as Metered's credentials endpoint with its API key.
   * Without it, sessions use direct connections only.
   */
  readonly VITE_TURN_CREDENTIALS_URL?: string
}
