import { z } from 'zod'

/**
 * Schéma de validation d'un élève reçu par l'API /api/v1. Chaque champ texte
 * a un `.max()` : l'API est ouverte à Internet (derrière une clé), donc la
 * taille des entrées doit être bornée.
 */

const text = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform(v => v || null)

export const apiStudentSchema = z.object({
  externalId: z.string().trim().min(1).max(128).optional(),
  student: z.object({
    firstName:   text(80),
    lastName:    text(80),
    email:       z.string().trim().toLowerCase().email().max(254).optional().nullable().transform(v => v || null),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ').optional().nullable(),
    gender:      z.enum(['M', 'F']).optional().nullable(),
    address:     optionalText(300),
  }),
  parent: z.object({
    firstName: text(80),
    lastName:  text(80),
    email:     z.string().trim().toLowerCase().email().max(254).optional().nullable().transform(v => v || null),
    phone:     optionalText(30),
    relation:  z.enum(['PARENT', 'TUTEUR', 'GRAND_PARENT', 'AUTRE']).optional().nullable(),
  }),
  classId:   z.string().trim().max(64).optional().nullable(),
  className: z.string().trim().max(80).optional().nullable(),
})

export type ApiStudentInput = z.infer<typeof apiStudentSchema>

export const apiBatchSchema = z.object({
  students: z.array(apiStudentSchema).min(1).max(100),
})

/** Convertit l'entrée validée de l'API vers l'entrée du cœur de création. */
export function toProvisionInput(input: ApiStudentInput) {
  return {
    student: input.student,
    parent:  input.parent,
    classId:   input.classId   || null,
    className: input.className || null,
    externalRef: input.externalId ?? null,
  }
}
