// Gemeinsamer Zustand der Tab-Seiten: Neue Aufgabe und Schnell notieren (Plus-Knopf in der Leiste).
import {
  createContext,
  useContext,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';

interface AppApi {
  /** Schnell erfassen (Plus lange drücken). */
  captureOpen: boolean;
  setCaptureOpen: (open: boolean) => void;
  /** Schnell notieren (Plus lange drücken): Aufgabe „Später, 30 Min“ */
  quickOpen: boolean;
  setQuickOpen: (open: boolean) => void;
  /** Plus-Knopf, damit Sheets von dort aufklappen können. */
  plusRef: MutableRefObject<unknown>;
}

const Ctx = createContext<AppApi>({
  captureOpen: false,
  setCaptureOpen: () => undefined,
  quickOpen: false,
  setQuickOpen: () => undefined,
  plusRef: { current: null },
});
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const plusRef = useRef<unknown>(null);
  return (
    <Ctx.Provider value={{ captureOpen, setCaptureOpen, quickOpen, setQuickOpen, plusRef }}>
      {children}
    </Ctx.Provider>
  );
}
