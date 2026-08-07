/**
 * Générateur iCalendar (RFC 5545) minimal, sans dépendance externe — assez
 * pour exporter l'agenda et l'emploi du temps vers Google/Apple/Outlook
 * Calendar. Volontairement simple : pas de fuseaux horaires nommés (VTIMEZONE),
 * les horaires sont exportés en heure locale flottante (comportement standard
 * pour un agenda scolaire mono-fuseau).
 */

export interface IcsEvent {
  uid:         string
  title:       string
  description?: string | null
  /** Journée entière si `end` est omis et `allDay` est vrai. */
  start:       Date
  end?:        Date | null
  allDay?:     boolean
  /** Règle de récurrence RFC 5545 brute, ex. "FREQ=WEEKLY;UNTIL=20270630T000000Z". */
  rrule?:      string | null
}

function foldLine(line: string): string {
  // RFC 5545 : replier les lignes de plus de 75 octets avec un saut + espace.
  if (line.length <= 75) return line
  let result = ''
  let rest = line
  while (rest.length > 75) {
    result += rest.slice(0, 75) + '\r\n '
    rest = rest.slice(75)
  }
  return result + rest
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function formatDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function buildIcs(calendarName: string, events: IcsEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MyClassLink//Agenda//FR',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]

  const now = formatDateTime(new Date())

  for (const ev of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${ev.uid}@myclasslink.cloud`)
    lines.push(`DTSTAMP:${now}`)
    lines.push(foldLine(`SUMMARY:${escapeText(ev.title)}`))
    if (ev.description) lines.push(foldLine(`DESCRIPTION:${escapeText(ev.description)}`))

    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDate(ev.start)}`)
      const end = ev.end ?? new Date(ev.start.getTime() + 86400000)
      lines.push(`DTEND;VALUE=DATE:${formatDate(end)}`)
    } else {
      lines.push(`DTSTART:${formatDateTime(ev.start)}`)
      if (ev.end) lines.push(`DTEND:${formatDateTime(ev.end)}`)
    }
    if (ev.rrule) lines.push(`RRULE:${ev.rrule}`)

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
