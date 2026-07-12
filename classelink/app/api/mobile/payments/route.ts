import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { withMobileAuth } from '@/lib/auth/mobile-guard'

export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')

  try {
    if (user.role === 'PARENT' && !studentId) {
      // Tous les enfants du parent
      const children: any[] = await tenantDb.$queryRaw`
        SELECT ps.student_id
        FROM parent_students ps
        JOIN parents p ON p.id = ps.parent_id
        WHERE p.user_id = ${user.userId}
      `
      if (!children.length) return NextResponse.json({ payments: [] })

      const ids = children.map((c: any) => c.student_id as string)
      const rows: any[] = await tenantDb.$queryRaw`
        SELECT
          p.id, p.amount, p.due_date, p.status,
          COALESCE(ft.name, 'Frais scolaires') AS description,
          p.created_at,
          u.first_name || ' ' || u.last_name AS student_name
        FROM payments p
        JOIN students s ON s.id = p.student_id
        JOIN users u    ON u.id = s.user_id
        LEFT JOIN fee_types ft ON ft.id = p.fee_type_id
        WHERE p.student_id IN (${Prisma.join(ids)})
        ORDER BY p.created_at DESC
        LIMIT 50
      `
      return NextResponse.json({ payments: _format(rows, true) })
    }

    if (user.role === 'PARENT' && studentId) {
      const check: any[] = await tenantDb.$queryRaw`
        SELECT ps.id FROM parent_students ps
        JOIN parents p ON p.id = ps.parent_id
        WHERE p.user_id = ${user.userId} AND ps.student_id = ${studentId}
        LIMIT 1
      `
      if (!check[0]) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 })
    }

    // Élève : son propre studentId
    let targetId = studentId
    if (user.role === 'STUDENT') {
      const rows: any[] = await tenantDb.$queryRaw`
        SELECT id FROM students WHERE user_id = ${user.userId} LIMIT 1
      `
      targetId = rows[0]?.id ?? null
    }

    if (!targetId) return NextResponse.json({ payments: [] })

    const rows: any[] = await tenantDb.$queryRaw`
      SELECT
        p.id, p.amount, p.due_date, p.status,
        COALESCE(ft.name, 'Frais scolaires') AS description,
        p.created_at
      FROM payments p
      LEFT JOIN fee_types ft ON ft.id = p.fee_type_id
      WHERE p.student_id = ${targetId as string}
      ORDER BY p.created_at DESC
      LIMIT 50
    `
    return NextResponse.json({ payments: _format(rows, false) })
  } catch {
    return NextResponse.json({ payments: [] })
  }
})

function _format(rows: any[], withStudent: boolean) {
  return rows.map((r: any) => ({
    id:          r.id,
    amount:      Number(r.amount),
    dueDate:     r.due_date,
    status:      r.status,
    description: r.description,
    createdAt:   r.created_at,
    ...(withStudent ? { studentName: r.student_name } : {}),
  }))
}
