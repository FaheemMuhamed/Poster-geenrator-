import { createContext, useContext, useSyncExternalStore } from 'react';

export const EngineContext = createContext(null);

// Returns the poster engine and re-renders the component whenever settings change.
export function useEngine() {
  const engine = useContext(EngineContext);
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  return engine;
}
