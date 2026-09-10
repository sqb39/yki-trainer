import type { WritingEntry } from '../db/schema'
import type { BookChapter } from '../db/seed'

export interface ChecklistItem {
  id: string
  labelSv: string
}

const GENERIC_CHECKLISTS: Record<WritingEntry['taskType'], ChecklistItem[]> = {
  meddelande: [
    { id: 'greeting', labelSv: 'Hälsning och vem meddelandet gäller' },
    { id: 'purpose', labelSv: 'Syftet är tydligt' },
    { id: 'details', labelSv: 'Nödvändiga detaljer finns med' },
    { id: 'closing', labelSv: 'Naturlig avslutning' },
  ],
  'e-post': [
    { id: 'subject', labelSv: 'Tydlig ämnesrad' },
    { id: 'greeting', labelSv: 'Passande hälsning' },
    { id: 'request', labelSv: 'Begäran eller ärende är klart' },
    { id: 'details', labelSv: 'Viktiga uppgifter (tid, plats, kontakt)' },
    { id: 'closing', labelSv: 'Artig avslutning' },
  ],
  klagomål: [
    { id: 'intro', labelSv: 'Vem du är och varför du skriver' },
    { id: 'problems', labelSv: 'Problemet beskrivs tydligt' },
    { id: 'action', labelSv: 'Du ber om en konkret åtgärd' },
    { id: 'tone', labelSv: 'Tonen är bestämd men artig' },
  ],
  övrigt: [
    { id: 'task', labelSv: 'Uppgiften är besvarad' },
    { id: 'structure', labelSv: 'Texten har början, mitt och slut' },
    { id: 'detail', labelSv: 'Tillräckligt med detaljer och exempel' },
    { id: 'language', labelSv: 'Språket är begripligt på B1-nivå' },
  ],
}

export const TASK_TYPE_LABELS: Record<WritingEntry['taskType'], string> = {
  meddelande: 'Meddelande',
  'e-post': 'E-post',
  klagomål: 'Klagomål',
  övrigt: 'Skrivuppgift',
}

export function checklistItemsForTask(
  taskType: WritingEntry['taskType'],
  promptSv: string,
): ChecklistItem[] {
  const bullets = promptSv
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('•'))
    .map((line) => line.replace(/^•\s*/, ''))
  if (bullets.length >= 2) {
    return bullets.map((labelSv, i) => ({ id: `bullet-${i}`, labelSv }))
  }
  return GENERIC_CHECKLISTS[taskType] ?? GENERIC_CHECKLISTS.övrigt
}

export function emptyChecklist(
  taskType: WritingEntry['taskType'],
  promptSv = '',
): Record<string, boolean> {
  return Object.fromEntries(
    checklistItemsForTask(taskType, promptSv).map((item) => [item.id, false]),
  )
}

export function checklistComplete(
  taskType: WritingEntry['taskType'],
  checklist: Record<string, boolean>,
  promptSv = '',
): boolean {
  return checklistItemsForTask(taskType, promptSv).every((item) => checklist[item.id])
}

function fallbackPrompt(chapter: BookChapter, type: WritingEntry['taskType']): string {
  const tema = chapter.title_sv
  if (type === 'meddelande') {
    return `Skriv ett meddelande till en vän om temat ${tema}.\n• berätta vad som hänt\n• vad du tycker om det\n• vad ni kan göra tillsammans`
  }
  if (type === 'e-post') {
    return `Skriv ett e-postmeddelande till en myndighet eller arbetsplats om temat ${tema}.\n• vem du är\n• vad du behöver hjälp med\n• när du vill ha svar`
  }
  return `Skriv ett klagomål kopplat till temat ${tema}.\n• vad som är fel\n• vad som bör åtgärdas\n• när du vill ha det gjort`
}

export function ensureWritingTrio(chapter: BookChapter): BookChapter['writing'] {
  const tasks = [...chapter.writing]
  const needed: WritingEntry['taskType'][] = ['meddelande', 'e-post', 'klagomål']
  for (const type of needed) {
    if (tasks.length >= 3) break
    if (!tasks.some((t) => t.type === type)) {
      tasks.push({ type, prompt_sv: fallbackPrompt(chapter, type) })
    }
  }
  return tasks.slice(0, 3)
}
