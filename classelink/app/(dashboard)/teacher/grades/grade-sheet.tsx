'use client'

import { useRef, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { saveGrade, deleteGrade } from '@/actions/teacher'
import { suggestGradeComment } from '@/actions/ai'
import { ExportExcelButton } from '@/components/ui/export-excel-button'

const GRADE_TYPES = [
  { value: 'DEVOIR',        label: 'Devoir' },
  { value: 'INTERROGATION', label: 'Interrogation' },
  { value: 'COMPOSITION',   label: 'Composition' },
  { value: 'EXAM',          label: 'Examen' },
]

interface Grade {
  id: string
  type: string
  value: number
  coefficient: number
  comment: string | null
}

interface Student {
  student_id: string
  student_number: string
  first_name: string
  last_name: string
  grades: Grade[]
  average: number | null
}

interface Props {
  students: Student[]
  subjectId: string
  subjectName: string
  termId: string
}

export function GradeSheet({ students: initial, subjectId, subjectName, termId }: Props) {
  const [students, setStudents] = useState(initial)
  const [gradeType, setGradeType] = useState('DEVOIR')
  const [coefficient, setCoefficient] = useState('1')
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState<string | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map(s => [s.student_id, '']))
  )
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map(s => [s.student_id, '']))
  )
  const [aiLoadingFor, setAiLoadingFor] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [importInfo, setImportInfo] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleInput(studentId: string, value: string) {
    setInputs(prev => ({ ...prev, [studentId]: value }))
  }

  function handleComment(studentId: string, value: string) {
    setComments(prev => ({ ...prev, [studentId]: value }))
  }

  async function handleSuggestComment(student: Student) {
    const value = parseFloat(inputs[student.student_id])
    if (isNaN(value)) {
      setAiError('Saisissez d\'abord une note pour obtenir une suggestion.')
      return
    }
    setAiError(null)
    setAiLoadingFor(student.student_id)
    try {
      const result = await suggestGradeComment({
        studentFirstName: student.first_name,
        subjectName: subjectName || 'cette matière',
        value,
        maxValue: 20,
        classAverage: student.average,
      })
      if (result.success && result.data) {
        setComments(prev => ({ ...prev, [student.student_id]: result.data as string }))
      } else if (!result.success) {
        setAiError(result.error ?? 'Erreur de l\'assistant IA.')
      }
    } finally {
      setAiLoadingFor(null)
    }
  }

  async function handleSaveAll() {
    setError(null)
    setSuccess(false)
    setImportInfo(null)
    const toSave = students.filter(s => inputs[s.student_id]?.trim() !== '')
    if (toSave.length === 0) {
      setError('Aucune note à enregistrer.')
      return
    }

    startTransition(async () => {
      for (const student of toSave) {
        const fd = new FormData()
        fd.set('student_id', student.student_id)
        fd.set('subject_id', subjectId)
        fd.set('term_id', termId)
        fd.set('type', gradeType)
        fd.set('value', inputs[student.student_id])
        fd.set('coefficient', coefficient)
        if (comments[student.student_id]?.trim()) {
          fd.set('comment', comments[student.student_id].trim())
        }

        const result = await saveGrade(null, fd)
        if (!result.success) {
          setError(`Erreur pour ${student.first_name} ${student.last_name}: ${result.error}`)
          return
        }
      }
      setSuccess(true)
      setInputs(Object.fromEntries(students.map(s => [s.student_id, ''])))
      setComments(Object.fromEntries(students.map(s => [s.student_id, ''])))
      setTimeout(() => setSuccess(false), 3000)
    })
  }

  async function handleDelete(studentId: string, gradeId: string) {
    setError(null)
    setSaving(gradeId)
    const result = await deleteGrade(gradeId)
    setSaving(null)
    if (!result.success) {
      setError(result.error)
      return
    }
    setStudents(prev => prev.map(s => s.student_id === studentId
      ? { ...s, grades: s.grades.filter(g => g.id !== gradeId) }
      : s))
  }

  /**
   * Importe un fichier Excel/CSV (colonnes "N° élève" et "Note", "Appréciation"
   * optionnelle) et pré-remplit la grille de saisie — l'enseignant vérifie
   * avant de cliquer "Enregistrer toutes les notes" (même chemin que la saisie
   * manuelle, aucune note n'est écrite tant qu'il n'a pas validé).
   */
  async function handleImportFile(file: File) {
    setError(null)
    setImportInfo(null)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet)

      const byNumber = new Map(students.map(s => [s.student_number.trim().toLowerCase(), s]))
      const newInputs: Record<string, string> = {}
      const newComments: Record<string, string> = {}
      let matched = 0
      let unmatched = 0

      for (const row of rows) {
        const numberKey = String(row['N° élève'] ?? row['Numero'] ?? row['student_number'] ?? '').trim().toLowerCase()
        const rawValue = row['Note'] ?? row['note'] ?? row['value']
        if (!numberKey || rawValue === undefined || rawValue === '') continue

        const student = byNumber.get(numberKey)
        const value = parseFloat(String(rawValue).replace(',', '.'))
        if (!student || isNaN(value) || value < 0 || value > 20) { unmatched++; continue }

        newInputs[student.student_id] = String(value)
        const comment = row['Appréciation'] ?? row['Appreciation'] ?? row['comment']
        if (comment) newComments[student.student_id] = String(comment).trim()
        matched++
      }

      if (matched === 0) {
        setError('Aucune ligne valide reconnue. Vérifiez les colonnes "N° élève" et "Note".')
        return
      }

      setInputs(prev => ({ ...prev, ...newInputs }))
      setComments(prev => ({ ...prev, ...newComments }))
      setImportInfo(
        `${matched} note${matched > 1 ? 's' : ''} importée${matched > 1 ? 's' : ''} dans la grille` +
        (unmatched > 0 ? ` (${unmatched} ligne${unmatched > 1 ? 's' : ''} ignorée${unmatched > 1 ? 's' : ''}).` : '.') +
        ' Vérifiez puis cliquez sur "Enregistrer toutes les notes".'
      )
    } catch {
      setError('Fichier illisible. Utilisez un export .xlsx ou .csv avec les colonnes "N° élève" et "Note".')
    }
  }

  return (
    <div className="space-y-4">
      {/* Barre de contrôle */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type d&apos;évaluation</label>
            <select
              value={gradeType}
              onChange={e => setGradeType(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {GRADE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Coefficient</label>
            <input
              type="number"
              min="0.5"
              max="10"
              step="0.5"
              value={coefficient}
              onChange={e => setCoefficient(e.target.value)}
              className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSaveAll}
            disabled={pending}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold
                       hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {pending ? 'Enregistrement...' : 'Enregistrer toutes les notes'}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleImportFile(file)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200
                         text-gray-700 text-sm font-medium rounded-lg transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importer
            </button>
            <ExportExcelButton
              rows={students.map(s => ({
                'N° élève': s.student_number,
                'Nom': s.last_name,
                'Prénom': s.first_name,
                'Note': '',
                'Appréciation': '',
                'Moyenne matière actuelle': s.average ?? '',
              }))}
              filename={`notes-${subjectName || 'matiere'}`}
              sheetName="Notes"
              label="Exporter"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        {importInfo && (
          <p className="mt-3 text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">{importInfo}</p>
        )}
        {success && (
          <p className="mt-3 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
            Notes enregistrées avec succès.
          </p>
        )}
        {aiError && (
          <p className="mt-3 text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2">{aiError}</p>
        )}
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Élève
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">
                Nouvelle note /20
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-64">
                Appréciation
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Moyenne matière
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Notes existantes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map(student => (
              <tr key={student.student_id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs
                                    font-bold flex items-center justify-center flex-shrink-0">
                      {student.first_name[0]}{student.last_name[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {student.last_name} {student.first_name}
                      </p>
                      <p className="text-xs text-gray-400">{student.student_number}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.25"
                    placeholder="—"
                    value={inputs[student.student_id] ?? ''}
                    onChange={e => handleInput(student.student_id, e.target.value)}
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-300 text-center
                               text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-start gap-1.5">
                    <textarea
                      rows={2}
                      placeholder="Appréciation (optionnel)"
                      value={comments[student.student_id] ?? ''}
                      onChange={e => handleComment(student.student_id, e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-300 text-xs resize-none
                                 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      title="Suggérer avec l'IA"
                      onClick={() => handleSuggestComment(student)}
                      disabled={aiLoadingFor === student.student_id}
                      className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg
                                 bg-violet-50 text-violet-600 hover:bg-violet-100 transition disabled:opacity-40"
                    >
                      {aiLoadingFor === student.student_id ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  {student.average !== null ? (
                    <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold ${
                      student.average >= 10
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {Number(student.average).toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {student.grades.map((g: Grade) => (
                      <div key={g.id}
                        className="group flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
                        <span className="text-xs text-gray-500">{g.type.slice(0, 3)}.</span>
                        <span className="text-xs font-semibold text-gray-800">{Number(g.value).toFixed(2)}</span>
                        <span className="text-xs text-gray-400">×{g.coefficient}</span>
                        <button
                          onClick={() => handleDelete(student.student_id, g.id)}
                          disabled={saving === g.id}
                          className="ml-0.5 text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                          title="Supprimer"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {student.grades.length === 0 && (
                      <span className="text-xs text-gray-300 italic">Aucune note</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
