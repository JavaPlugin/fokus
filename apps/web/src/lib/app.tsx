// Gemeinsamer Zustand der Tab-Seiten: Erfassen-Sheet (Plus-Knopf in der Leiste).
import {
  createContext,
  useContext,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';

interface AppApi {
  /** Schnell erfassen (Plus-Knopf): Notiz für die Inbox. */
  captureOpen: boolean;
  setCaptureOpen: (open: boolean) => void;
  /** Plus-Knopf, damit Sheets von dort aufklappen können. */
  plusRef: MutableRefObject<unknown>;
}

const Ctx = createContext<AppApi>({
  captureOpen: false,
  setCaptureOpen: () => undefined,
  plusRef: { current: null },
});
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const plusRef = useRef<unknown>(null);
  return <Ctx.Provider value={{ captureOpen, setCaptureOpen, plusRef }}>{children}</Ctx.Provider>;
}
