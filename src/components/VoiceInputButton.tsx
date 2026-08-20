import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { useVoiceGlossaryTerms } from "../hooks/useVoiceGlossaryTerms";
import { normalizeVoiceTranscript } from "../lib/voiceGlossary";

interface SpeechRecognitionResultLike {
  readonly length: number;
  item(index: number): { transcript: string };
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    item(index: number): SpeechRecognitionResultLike;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition() {
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition;
}

export default function VoiceInputButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const { t, lang } = useLanguage();
  const customTerms = useVoiceGlossaryTerms();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldKeepListeningRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const Recognition = typeof window === "undefined" ? undefined : getSpeechRecognition();

  // Without this, closing the form left the recogniser running: `onend` restarted it
  // every 250ms forever, so the mic stayed live and each reopened form added another one.
  useEffect(
    () => () => {
      shouldKeepListeningRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    },
    [],
  );

  if (!Recognition) return null;
  const RecognitionCtor = Recognition;

  function stopListening() {
    shouldKeepListeningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }

  function startListening() {
    if (isListening) {
      stopListening();
      return;
    }

    shouldKeepListeningRef.current = true;
    const recognition = new RecognitionCtor();
    recognitionRef.current = recognition;
    recognition.lang = lang === "zh" ? "zh-CN" : "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i] ?? event.results.item(i);
        for (let j = 0; j < result.length; j += 1) {
          parts.push((result[j] ?? result.item(j)).transcript);
        }
      }
      const transcript = normalizeVoiceTranscript(parts.join(" "), customTerms);
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = (event) => {
      // "no-speech" is just a pause — that's the one case worth resuming for.
      // Anything else (network, aborted, permissions) used to fall through to the
      // restart loop, leaving the button stuck listening and transcribing nothing.
      if (event.error === "no-speech") return;
      shouldKeepListeningRef.current = false;
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognition.onend = () => {
      if (!shouldKeepListeningRef.current) {
        recognitionRef.current = null;
        setIsListening(false);
        return;
      }

      window.setTimeout(() => {
        if (!shouldKeepListeningRef.current) return;
        try {
          recognition.start();
          recognitionRef.current = recognition;
          setIsListening(true);
        } catch {
          shouldKeepListeningRef.current = false;
          recognitionRef.current = null;
          setIsListening(false);
        }
      }, 250);
    };
    // If start() throws, the "should keep listening" flag must not stay set — otherwise
    // the button reads as idle while a live recogniser lingers, and the next click
    // starts a second one on top of it.
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      shouldKeepListeningRef.current = false;
      recognitionRef.current = null;
      setIsListening(false);
    }
  }

  return (
    <button
      type="button"
      onClick={startListening}
      aria-label={isListening ? t("voiceInput.stop") : t("voiceInput.start")}
      title={isListening ? t("voiceInput.stop") : t("voiceInput.start")}
      className={[
        "inline-flex h-7 w-7 items-center justify-center rounded-(--radius-sm) transition",
        isListening
          ? "bg-(--color-primary) text-white"
          : "text-(--color-ink-faint) hover:bg-(--color-canvas-soft) hover:text-(--color-primary)",
      ].join(" ")}
    >
      {isListening ? <Square size={13} fill="currentColor" /> : <Mic size={14} />}
    </button>
  );
}
