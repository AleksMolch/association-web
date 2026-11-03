/**
 * speech.ts — произношение английских слов в браузере.
 *
 * Использует Web Speech API. Если голос недоступен, интерфейс продолжает
 * работать без звука.
 */

export function speakEnglish(text: string, rate = 0.95): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}
