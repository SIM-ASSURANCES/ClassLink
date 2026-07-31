import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/auth/mobile-guard'
import { Prisma } from '@prisma/client'

// Cantine — élève : son abonnement ; parent : l'abonnement de CHAQUE enfant
// (comme la page web /parent/cafeteria, voir actions/cafeteria.ts::
// getStudentCafeteriaInfo). Menus de la semaine communs aux deux rôles.
export const GET = withMobileAuth(['STUDENT', 'PARENT'], async (req, { user, tenantDb }) => {
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('weekStart')

  const weekFilter = weekStart
    ? Prisma.sql`${weekStart}::date`
    : Prisma.sql`date_trunc('week', NOW())::date`

  const menus: any[] = await tenantDb.$queryRaw`
    SELECT id, week_start, day_of_week, meal_type, description, price
    FROM cafeteria_menus
    WHERE week_start = ${weekFilter}
    ORDER BY day_of_week, meal_type
  `

  const menusJson = menus.map(m => ({
    id:         m.id,
    weekStart:  m.week_start,
    dayOfWeek:  m.day_of_week,
    mealType:   m.meal_type,
    description:m.description,
    price:      parseFloat(m.price ?? 0),
  }))

  const subJson = (s: any) => s ? {
    id:         s.id,
    meal_type:  s.meal_type,
    status:     s.status,
    start_date: s.start_date,
    amount:     s.amount_paid != null ? parseFloat(s.amount_paid) : null,
  } : null

  // Parent : un statut d'abonnement par enfant, comme le web.
  if (user.role === 'PARENT') {
    const rows: any[] = await tenantDb.$queryRaw`
      SELECT
        s.id AS student_id,
        u.first_name, u.last_name,
        c.name AS class_name,
        cs.id AS sub_id, cs.meal_type, cs.status, cs.start_date, cs.amount_paid
      FROM parent_students ps
      JOIN parents p  ON p.id = ps.parent_id
      JOIN students s ON s.id = ps.student_id
      JOIN users u    ON u.id = s.user_id
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
      LEFT JOIN classes c     ON c.id = e.class_id
      LEFT JOIN LATERAL (
        SELECT cs.id, cs.meal_type, cs.status, cs.start_date, cs.amount_paid
        FROM cafeteria_subscriptions cs
        WHERE cs.student_id = s.id AND cs.status = 'ACTIVE'
        ORDER BY cs.start_date DESC
        LIMIT 1
      ) cs ON TRUE
      WHERE p.user_id = ${user.userId}
      ORDER BY u.last_name, u.first_name
    `

    return NextResponse.json({
      menus: menusJson,
      children: rows.map(r => ({
        studentId: r.student_id,
        firstName: r.first_name,
        lastName:  r.last_name,
        className: r.class_name,
        subscription: r.sub_id ? subJson({
          id: r.sub_id, meal_type: r.meal_type, status: r.status,
          start_date: r.start_date, amount_paid: r.amount_paid,
        }) : null,
      })),
      subscription: null,
    })
  }

  // Élève : son propre abonnement actif.
  const studentSub: any[] = await tenantDb.$queryRaw`
    SELECT cs.id, cs.meal_type, cs.status, cs.start_date, cs.amount_paid
    FROM cafeteria_subscriptions cs
    JOIN students s ON s.id = cs.student_id
    WHERE s.user_id = ${user.userId}
      AND cs.status = 'ACTIVE'
    ORDER BY cs.start_date DESC
    LIMIT 1
  `

  return NextResponse.json({
    menus: menusJson,
    subscription: subJson(studentSub[0] ?? null),
  })
})
