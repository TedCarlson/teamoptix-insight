export type FoyerSpeechSupport = {
  supported: boolean;
  apiName: "SpeechRecognition" | "webkitSpeechRecognition" | null;
};

export type FoyerSpeechTranscript = {
  text: string;
  isFinal: boolean;
};

type SpeechWindow = Window & {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

export function getFoyerSpeechSupport(): FoyerSpeechSupport {
  if (typeof window === "undefined") {
    return {
      supported: false,
      apiName: null,
    };
  }

  const speechWindow = window as SpeechWindow;

  if (speechWindow.SpeechRecognition) {
    return {
      supported: true,
      apiName: "SpeechRecognition",
    };
  }

  if (speechWindow.webkitSpeechRecognition) {
    return {
      supported: true,
      apiName: "webkitSpeechRecognition",
    };
  }

  return {
    supported: false,
    apiName: null,
  };
}
