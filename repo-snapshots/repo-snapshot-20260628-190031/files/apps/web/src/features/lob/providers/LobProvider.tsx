"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOB } from "../lib/constants";
import type { LobContextState } from "../lib/types";

const LobContext = createContext<LobContextState>(DEFAULT_LOB);

export function LobProvider(props: { children: React.ReactNode }) {
  return (
    <LobContext.Provider value={DEFAULT_LOB}>
      {props.children}
    </LobContext.Provider>
  );
}

export function useLob() {
  return useContext(LobContext);
}