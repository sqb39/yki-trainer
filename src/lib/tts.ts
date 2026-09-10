export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speakSv(text: string): void {
  if (!canSpeak() || !text.trim()) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'sv-SE'
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
