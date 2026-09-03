import type { WritingEntry } from '../db/schema'

export interface ChecklistItem {
  id: string
  labelSv: string
}

export const WRITING_CHECKLISTS: Record<WritingEntry['taskType'], ChecklistItem[]> = {
  meddelande: [
    { id: 'greeting', labelSv: 'Hälsning och vem meddelandet gäller' },
    { id: 'context', labelSv: 'Berättar vad som hänt och var du hört om det' },
    { id: 'reaction', labelSv: 'Gratulerar och uttrycker din åsikt' },
    { id: 'plan', labelSv: 'Föreslår hur ni kan fira tillsammans' },
    { id: 'closing', labelSv: 'Avslutar meddelandet på ett naturligt sätt' },
  ],
  'e-post': [
    { id: 'subject', labelSv: 'Tydlig ämnesrad' },
    { id: 'greeting', labelSv: 'Formell hälsning' },
    { id: 'housing', labelSv: 'Beskriver vilken typ av bostad du söker' },
    { id: 'location', labelSv: 'Förklarar vad som är viktigt med läget' },
    { id: 'budget', labelSv: 'Anger hyra/pris och flyttdatum' },
    { id: 'closing', labelSv: 'Artig avslutning och kontaktuppgifter' },
  ],
  klagomål: [
    { id: 'intro', labelSv: 'Presenterar dig och syftet med brevet' },
    { id: 'problems', labelSv: 'Beskriver problemen tydligt' },
    { id: 'action', labelSv: 'Ber om åtgärder och tidsfrist' },
    { id: 'consequence', labelSv: 'Förklarar vad du gör om inget händer' },
    { id: 'tone', labelSv: 'Tonen är bestämd men artig' },
  ],
}

export const TASK_TYPE_LABELS: Record<WritingEntry['taskType'], string> = {
  meddelande: 'Meddelande',
  'e-post': 'E-post',
  klagomål: 'Klagomål',
}

export function emptyChecklist(taskType: WritingEntry['taskType']): Record<string, boolean> {
  return Object.fromEntries(WRITING_CHECKLISTS[taskType].map((item) => [item.id, false]))
}

export function checklistComplete(
  taskType: WritingEntry['taskType'],
  checklist: Record<string, boolean>,
): boolean {
  return WRITING_CHECKLISTS[taskType].every((item) => checklist[item.id])
}
